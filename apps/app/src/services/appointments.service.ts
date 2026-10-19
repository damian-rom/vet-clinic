import {
  emptyRequestSchema,
  pickTimeSchema,
  assignVetSchema,
  rescheduleSchema,
  savePlanSchema,
  completeVisitSchema,
} from '@vet-clinic/validation';
import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import type { Appointment, User, VisitPlan } from '@vet-clinic/types';
import { bookAppointmentSchema } from '@vet-clinic/validation';
import {
  clinicSettings,
  clinicInstant,
  endOf,
  localParts,
  overlaps,
  weeklyOccurrences,
} from '../time';
import {
  fail,
  id,
  active,
  duration,
  requireVet,
  requireOwner,
  isoNow,
  validatePlan,
} from '../domain/rules';
import type { Repositories, Store } from '../infrastructure/prisma/repositories';
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
    private readonly store: Store,
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
  private async schedule(repos: Repositories, from: number, to: number): Promise<Schedule> {
    const blocks = await repos.timeBlocks.overlapping(from, to);
    const weekly = await repos.weeklyTimeBlocks.list();
    const visits = await repos.appointments.scheduledNear(from, to, [
      'Confirmed',
      'AwaitingConfirmation',
    ]);
    return {
      capacity: await repos.users.countVets(),
      blocks: [
        ...blocks.map((b) => ({ start: Date.parse(b.startsAt), end: Date.parse(b.endsAt) })),
        ...weeklyOccurrences(weekly, from, to, this.settings.timezone),
      ],
      visits: visits.map((a) => ({
        id: a.id,
        vetId: a.vetId,
        start: Date.parse(a.scheduledAt),
        end: endOf(a.scheduledAt, a.durationMinutes),
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
      if (!vet || vet.role !== 'vet') fail('Choose a veterinarian', 400);
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
  /** Fails unless `candidate` fits the clinic's hours, blocks, capacity and its vet's calendar. */
  async reserve(repos: Repositories, candidate: Appointment, future = true) {
    if (!candidate.scheduledAt) fail('This appointment needs a time');
    const vet = candidate.vetId ? await repos.users.get(candidate.vetId) : undefined;
    const start = Date.parse(candidate.scheduledAt!);
    const end = endOf(candidate.scheduledAt!, duration(candidate));
    this.check(await this.schedule(repos, start, end), candidate, future, vet);
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
    return this.store.read(async (repos) => {
      let appointment: Appointment | undefined;
      if (appointmentId) {
        appointment = await repos.appointments.get(appointmentId);
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
        repos,
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
    return this.store.write(async (repos) => {
      const pet = await repos.pets.get(data.petId);
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      const appointment: Appointment = {
        ...data,
        id: id(),
        ownerId: user.id,
        status: 'AwaitingConfirmation',
        createdAt: isoNow(this.now),
        revision: 0,
      };
      await this.reserve(repos, appointment);
      await repos.appointments.create(appointment);
      return { id: appointment.id };
    });
  }

  /** Runs one action on an appointment as a single transaction. */
  async appointment(user: User, appointmentId: string, action: string, input: unknown) {
    return this.store.write(async (repos) => {
      const a = await repos.appointments.get(appointmentId);
      if (user.role === 'owner' && a.ownerId !== user.id) fail('Record not found', 404);
      if (action === 'cancel' || action === 'pick-time') {
        requireOwner(user);
        if (action === 'cancel') await this.cancel(repos, a, input);
        else await this.pickTime(repos, a, input);
        return { id: a.id };
      }
      requireVet(user);
      if (a.status === 'Done' || a.status === 'Cancelled')
        fail('Completed and cancelled appointments are read-only');
      if (action === 'assign') await this.assign(repos, a, input);
      else if (action === 'reschedule') await this.reschedule(repos, a, input);
      else if (action === 'request-time') await this.requestTime(repos, a, input);
      else if (action === 'plan') await this.savePlan(repos, user, a, input);
      else if (action === 'complete') await this.complete(repos, user, a, input);
      else fail('Unknown appointment action', 404);
      return { id: a.id };
    });
  }

  private async cancel(repos: Repositories, a: Appointment, input: unknown) {
    emptyRequestSchema.parse(input);
    if (a.caseId) fail('Case checkpoints are managed by the clinic');
    if (
      a.status === 'Done' ||
      a.status === 'Cancelled' ||
      (a.scheduledAt && Date.parse(a.scheduledAt) <= this.now())
    )
      fail('This appointment can no longer be cancelled');
    await repos.appointments.update(a, { status: 'Cancelled' });
  }

  /** The owner chooses a new time; a vet confirms it again. */
  private async pickTime(repos: Repositories, a: Appointment, input: unknown) {
    const { scheduledAt } = pickTimeSchema.parse(input);
    if (a.status !== 'NeedsTime') fail('This appointment is not waiting for a new time');
    const status = 'AwaitingConfirmation';
    await this.reserve(repos, { ...a, scheduledAt, vetId: undefined, status });
    await repos.appointments.update(a, { scheduledAt, vetId: null, status });
  }

  private async assign(repos: Repositories, a: Appointment, input: unknown) {
    const { vetId } = assignVetSchema.parse(input);
    if (a.status !== 'AwaitingConfirmation' && a.status !== 'Confirmed')
      fail('The owner must choose a time first');
    await this.reserve(repos, { ...a, vetId, status: 'Confirmed' });
    await repos.appointments.update(a, { vetId, status: 'Confirmed' });
  }

  private async reschedule(repos: Repositories, a: Appointment, input: unknown) {
    const { scheduledAt, revision } = rescheduleSchema.parse(input);
    if (a.status !== 'Confirmed') fail('Only confirmed appointments can be moved');
    this.checkRevision(a, revision);
    await this.reserve(repos, { ...a, scheduledAt });
    await repos.appointments.update(a, { scheduledAt });
  }

  /** Releases the slot and asks the owner to choose another time. */
  private async requestTime(repos: Repositories, a: Appointment, input: unknown) {
    emptyRequestSchema.parse(input);
    if (a.caseId && a.petNeeded === false)
      fail('Checkpoints without the pet must be scheduled by a veterinarian');
    await repos.appointments.update(a, { status: 'NeedsTime', scheduledAt: null, vetId: null });
  }

  /** Saving over an AI draft keeps the draft and marks the plan as reviewed. */
  private async savePlan(repos: Repositories, user: User, a: Appointment, input: unknown) {
    const { revision, ...fields } = savePlanSchema.parse(input);
    this.checkRevision(a, revision);
    await validatePlan(repos, fields, a.plan?.visitTypeId);
    const ai = a.plan?.source === 'ai-draft' || a.plan?.source === 'ai-reviewed';
    const plan: VisitPlan = {
      ...fields,
      source: ai ? 'ai-reviewed' : 'human',
      reviewedBy: user.id,
      savedAt: isoNow(this.now),
      ...(ai ? { originalDraft: a.plan!.originalDraft } : {}),
    };
    // A longer visit must still fit around the vet's other appointments.
    if (active(a) && a.scheduledAt) await this.reserve(repos, { ...a, plan }, false);
    await repos.appointments.replacePlan(a.id, plan);
    await repos.appointments.update(a);
  }

  /** Closes a visit and takes what it used out of stock. */
  private async complete(repos: Repositories, user: User, a: Appointment, input: unknown) {
    const { actualActives, revision } = completeVisitSchema.parse(input);
    this.checkRevision(a, revision);
    if (a.status !== 'Confirmed') fail('Only confirmed appointments can be completed');
    if (!a.scheduledAt || Date.parse(a.scheduledAt) > this.now())
      fail('A visit cannot be completed before its start time');
    if (!a.plan || a.plan.source === 'ai-draft')
      fail('Save and review the visit plan before completing the visit');
    for (const used of actualActives) {
      const product = await repos.products.get(used.productId);
      if (product.stock < used.quantity)
        fail(`Insufficient stock for ${product.name}. Correct the inventory first.`);
    }
    for (const used of actualActives)
      await this.inventory.recordMovement(repos, user, {
        ...used,
        quantity: -used.quantity,
        type: 'Used',
        appointmentId: a.id,
      });
    await repos.appointments.recordUsage(a.id, actualActives);
    await repos.appointments.update(a, { status: 'Done', completedAt: isoNow(this.now) });
  }

  /** Rejects a request made against an older version of the appointment. */
  private checkRevision(a: Appointment, revision: number) {
    if (a.revision !== revision) fail('This appointment changed. Refresh and try again');
  }
}
