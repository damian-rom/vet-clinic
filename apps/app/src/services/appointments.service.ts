import {
  emptyRequestSchema,
  pickTimeSchema,
  assignVetSchema,
  rescheduleSchema,
  savePlanSchema,
  completeVisitSchema,
  MAX_VISIT_MINUTES,
} from '@vet-clinic/validation';
import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import type { Database, Tx } from '@vet-clinic/db';
import type { Appointment, User } from '@vet-clinic/types';
import { bookAppointmentSchema } from '@vet-clinic/validation';
import { clinicSettings, clinicInstant, endOf, localParts, overlaps } from '../time';
import {
  fail,
  id,
  active,
  duration,
  requireVet,
  requireOwner,
  required,
  isoNow,
  validatePlan,
} from '../domain/rules';
import {
  appointmentInclude,
  createAppointment,
  saveAppointment,
  toAppointment,
} from '../infrastructure/prisma/records';
import { InventoryService } from './inventory.service';

interface Interval {
  start: number;
  end: number;
}
/** Everything that can conflict with a visit inside one time window. */
interface Schedule {
  capacity: number;
  blocks: Interval[];
  visits: (Interval & { id: string; vetId: string | null })[];
}

export class AppointmentsService {
  readonly settings;
  constructor(
    private readonly db: Database,
    private readonly inventory: InventoryService,
    private readonly now: () => number,
    timezone: string,
  ) {
    this.settings = clinicSettings(timezone);
  }
  private validateTime(iso: string, minutes: number, future = true) {
    if (!Number.isFinite(Date.parse(iso))) fail('Invalid appointment time', 400);
    if (future && Date.parse(iso) <= this.now()) fail('Choose a future time');
    const p = localParts(iso, this.settings.timezone);
    const day = new Date(`${p.date}T12:00:00Z`).getUTCDay();
    if (
      !this.settings.openDays.includes(day) ||
      p.hour < this.settings.openHour ||
      p.hour * 60 + p.minute + minutes > this.settings.closeHour * 60 ||
      p.minute % this.settings.slotMinutes !== 0 ||
      p.second !== 0 ||
      new Date(iso).getUTCMilliseconds() !== 0
    )
      fail('Choose a slot within clinic opening hours');
  }
  /** Loads blocks and active visits that could overlap [from, to). */
  private async schedule(tx: Tx, from: number, to: number): Promise<Schedule> {
    const capacity = await tx.user.count({ where: { role: 'vet' } });
    const blocks = await tx.timeBlock.findMany({
      where: {
        startsAt: { lt: new Date(to).toISOString() },
        endsAt: { gt: new Date(from).toISOString() },
      },
    });
    const visits = await tx.appointment.findMany({
      where: {
        status: { in: ['Confirmed', 'AwaitingConfirmation'] },
        // Stored instants share one ISO format, so text comparison follows time order.
        scheduledAt: {
          gte: new Date(from - MAX_VISIT_MINUTES * 60_000).toISOString(),
          lt: new Date(to).toISOString(),
        },
      },
      select: {
        id: true,
        vetId: true,
        scheduledAt: true,
        plan: { select: { durationMinutes: true } },
      },
    });
    return {
      capacity,
      blocks: blocks.map((b) => ({ start: Date.parse(b.startsAt), end: Date.parse(b.endsAt) })),
      visits: visits.map((a) => ({
        id: a.id,
        vetId: a.vetId,
        start: Date.parse(a.scheduledAt!),
        end: endOf(a.scheduledAt!, a.plan?.durationMinutes || 30),
      })),
    };
  }
  private check(
    schedule: Schedule,
    candidate: Appointment,
    future: boolean,
    vet?: { role: string } | null,
  ) {
    if (!candidate.scheduledAt) fail('This appointment needs a time');
    this.validateTime(candidate.scheduledAt!, duration(candidate), future);
    const start = Date.parse(candidate.scheduledAt!);
    const end = endOf(candidate.scheduledAt!, duration(candidate));
    if (schedule.blocks.some((b) => overlaps(start, end, b.start, b.end)))
      fail('This time overlaps a clinic block');
    const relevant = schedule.visits.filter(
      (a) => a.id !== candidate.id && overlaps(start, end, a.start, a.end),
    );
    if (candidate.vetId) {
      if (required(vet).role !== 'vet') fail('Choose a veterinarian', 400);
      if (relevant.some((a) => a.vetId === candidate.vetId))
        fail('This veterinarian already has an overlapping appointment');
    }
    const boundaries = [start, ...relevant.map((a) => a.start).filter((t) => t > start && t < end)];
    if (
      boundaries.some(
        (t) => relevant.filter((a) => a.start <= t && a.end > t).length >= schedule.capacity,
      )
    )
      fail('This slot is full. Please choose another time');
  }
  async reserve(tx: Tx, candidate: Appointment, future = true) {
    if (!candidate.scheduledAt) fail('This appointment needs a time');
    const vet = candidate.vetId
      ? await tx.user.findUnique({ where: { id: candidate.vetId }, select: { role: true } })
      : undefined;
    const start = Date.parse(candidate.scheduledAt!);
    const end = endOf(candidate.scheduledAt!, duration(candidate));
    this.check(await this.schedule(tx, start, end), candidate, future, vet);
  }
  async slots(user: User, date: string, appointmentId?: string) {
    const validDate = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(date);
    if (
      Number.isNaN(Date.parse(validDate)) ||
      new Date(validDate).toISOString().slice(0, 10) !== validDate
    )
      fail('Invalid date', 400);
    return this.db.read(async (tx) => {
      let appointment: Appointment | undefined;
      if (appointmentId) {
        appointment = toAppointment(
          required(
            await tx.appointment.findUnique({
              where: { id: appointmentId },
              include: appointmentInclude,
            }),
          ),
        );
        if (user.role === 'owner' && appointment.ownerId !== user.id) fail('Record not found', 404);
        if (appointment.status !== 'NeedsTime')
          fail('This appointment is not waiting for a new time');
      }
      const candidates: string[] = [];
      for (
        let mins = this.settings.openHour * 60;
        mins < this.settings.closeHour * 60;
        mins += this.settings.slotMinutes
      )
        candidates.push(
          clinicInstant(date, Math.floor(mins / 60), mins % 60, this.settings.timezone),
        );
      const minutes = appointment?.plan?.durationMinutes || 30;
      const schedule = await this.schedule(
        tx,
        Date.parse(candidates[0]),
        endOf(candidates.at(-1)!, minutes),
      );
      const slots = candidates.filter((scheduledAt) => {
        try {
          this.check(
            schedule,
            { id: appointment?.id || 'new', plan: appointment?.plan, scheduledAt } as Appointment,
            true,
          );
          return true;
        } catch (e) {
          if (!(e instanceof HttpException)) throw e;
          return false;
        }
      });
      return { slots, timezone: this.settings.timezone };
    });
  }
  async book(user: User, input: unknown) {
    requireOwner(user);
    const data = bookAppointmentSchema.parse(input);
    return this.db.write(async (tx) => {
      const pet = required(await tx.pet.findUnique({ where: { id: data.petId } }));
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      const appointment: Appointment = {
        ...data,
        id: id(),
        ownerId: user.id,
        status: 'AwaitingConfirmation',
        createdAt: isoNow(this.now),
        revision: 0,
      };
      await this.reserve(tx, appointment);
      await createAppointment(tx, appointment);
      return { id: appointment.id };
    });
  }
  async appointment(user: User, appointmentId: string, action: string, input: unknown) {
    return this.db.write(async (tx) => {
      const a = toAppointment(
        required(
          await tx.appointment.findUnique({
            where: { id: appointmentId },
            include: appointmentInclude,
          }),
        ),
      );
      const before = structuredClone(a);
      if (user.role === 'owner' && a.ownerId !== user.id) fail('Record not found', 404);
      if (action === 'cancel') {
        requireOwner(user);
        emptyRequestSchema.parse(input);
        if (a.caseId) fail('Case checkpoints are managed by the clinic');
        if (
          a.status === 'Done' ||
          a.status === 'Cancelled' ||
          (a.scheduledAt && Date.parse(a.scheduledAt) <= this.now())
        )
          fail('This appointment can no longer be cancelled');
        a.status = 'Cancelled';
      } else if (action === 'pick-time') {
        requireOwner(user);
        const data = pickTimeSchema.parse(input);
        if (a.status !== 'NeedsTime') fail('This appointment is not waiting for a new time');
        const candidate = {
          ...a,
          scheduledAt: data.scheduledAt,
          vetId: undefined,
          status: 'AwaitingConfirmation' as const,
        };
        await this.reserve(tx, candidate);
        Object.assign(a, candidate);
      } else {
        requireVet(user);
        if (a.status === 'Done' || a.status === 'Cancelled')
          fail('Completed and cancelled appointments are read-only');
        if (action === 'assign') {
          const data = assignVetSchema.parse(input);
          if (a.status !== 'AwaitingConfirmation' && a.status !== 'Confirmed')
            fail('The owner must choose a time first');
          const candidate = { ...a, vetId: data.vetId, status: 'Confirmed' as const };
          await this.reserve(tx, candidate);
          Object.assign(a, candidate);
        } else if (action === 'reschedule') {
          const data = rescheduleSchema.parse(input);
          if (a.status !== 'Confirmed') fail('Only confirmed appointments can be moved');
          this.checkRevision(a, data.revision);
          const candidate = { ...a, scheduledAt: data.scheduledAt };
          await this.reserve(tx, candidate);
          Object.assign(a, candidate);
        } else if (action === 'request-time') {
          emptyRequestSchema.parse(input);
          if (a.caseId && a.petNeeded === false)
            fail('Checkpoints without the pet must be scheduled by a veterinarian');
          a.status = 'NeedsTime';
          delete a.scheduledAt;
          delete a.vetId;
        } else if (action === 'plan') {
          const data = savePlanSchema.parse(input);
          this.checkRevision(a, data.revision);
          const { revision: _revision, ...plan } = data;
          await validatePlan(tx, plan, a.plan?.visitTypeId);
          const ai = a.plan?.source === 'ai-draft' || a.plan?.source === 'ai-reviewed';
          const candidate: Appointment = {
            ...a,
            plan: {
              ...plan,
              source: ai ? 'ai-reviewed' : 'human',
              reviewedBy: user.id,
              savedAt: isoNow(this.now),
              ...(ai ? { originalDraft: a.plan!.originalDraft } : {}),
            },
          };
          if (active(candidate) && candidate.scheduledAt) await this.reserve(tx, candidate, false);
          Object.assign(a, candidate);
        } else if (action === 'complete') {
          const data = completeVisitSchema.parse(input);
          this.checkRevision(a, data.revision);
          if (a.status !== 'Confirmed') fail('Only confirmed appointments can be completed');
          if (!a.scheduledAt || Date.parse(a.scheduledAt) > this.now())
            fail('A visit cannot be completed before its start time');
          if (!a.plan || a.plan.source === 'ai-draft')
            fail('Save and review the visit plan before completing the visit');
          for (const used of data.actualActives) {
            const product = required(
              await tx.product.findUnique({ where: { id: used.productId } }),
            );
            if (product.stock < used.quantity)
              fail(`Insufficient stock for ${product.name}. Correct the inventory first.`);
          }
          for (const used of data.actualActives)
            await this.inventory.recordMovement(tx, user, {
              ...used,
              quantity: -used.quantity,
              type: 'Used',
              appointmentId: a.id,
            });
          a.actualActives = data.actualActives;
          a.status = 'Done';
          a.completedAt = isoNow(this.now);
        } else fail('Unknown appointment action', 404);
      }
      a.revision++;
      await saveAppointment(tx, before, a);
      return { id: a.id };
    });
  }
  private checkRevision(a: Appointment, revision: number) {
    if (a.revision !== revision) fail('This appointment changed. Refresh and try again');
  }
}
