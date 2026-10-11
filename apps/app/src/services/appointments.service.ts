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
import type { Appointment, User } from '@vet-clinic/types';
import { bookAppointmentSchema } from '@vet-clinic/validation';
import { Store, type State } from '../infrastructure/sqlite/store';
import { clinicSettings, clinicInstant, endOf, localParts, overlaps } from '../time';
import {
  fail,
  id,
  active,
  duration,
  requireVet,
  requireOwner,
  find,
  isoNow,
  validatePlan,
} from '../domain/rules';
import { InventoryService } from './inventory.service';
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
  reserve(s: State, candidate: Appointment, future = true) {
    if (!candidate.scheduledAt) fail('This appointment needs a time');
    this.validateTime(candidate.scheduledAt!, duration(candidate), future);
    const start = Date.parse(candidate.scheduledAt!);
    const end = endOf(candidate.scheduledAt!, duration(candidate));
    if (
      s.timeBlocks.some((b) => overlaps(start, end, Date.parse(b.startsAt), Date.parse(b.endsAt)))
    )
      fail('This time overlaps a clinic block');
    const others = s.appointments.filter(
      (a) => a.id !== candidate.id && active(a) && a.scheduledAt,
    );
    if (candidate.vetId) {
      if (find(s.users, candidate.vetId).role !== 'vet') fail('Choose a veterinarian', 400);
      if (
        others.some(
          (a) =>
            a.vetId === candidate.vetId &&
            overlaps(start, end, Date.parse(a.scheduledAt!), endOf(a.scheduledAt!, duration(a))),
        )
      )
        fail('This veterinarian already has an overlapping appointment');
    }
    const capacity = s.users.filter((u) => u.role === 'vet').length;
    const relevant = others.filter((a) =>
      overlaps(start, end, Date.parse(a.scheduledAt!), endOf(a.scheduledAt!, duration(a))),
    );
    const boundaries = [
      start,
      ...relevant.map((a) => Date.parse(a.scheduledAt!)).filter((t) => t > start && t < end),
    ];
    if (
      boundaries.some(
        (t) =>
          relevant.filter(
            (a) => Date.parse(a.scheduledAt!) <= t && endOf(a.scheduledAt!, duration(a)) > t,
          ).length >= capacity,
      )
    )
      fail('This slot is full. Please choose another time');
  }
  slots(user: User, date: string, appointmentId?: string) {
    const validDate = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(date);
    if (
      Number.isNaN(Date.parse(validDate)) ||
      new Date(validDate).toISOString().slice(0, 10) !== validDate
    )
      fail('Invalid date', 400);
    const s = this.store.read();
    let appointment: Appointment | undefined;
    if (appointmentId) {
      appointment = find(s.appointments, appointmentId);
      if (user.role === 'owner' && appointment.ownerId !== user.id) fail('Record not found', 404);
      if (appointment.status !== 'NeedsTime')
        fail('This appointment is not waiting for a new time');
    }
    const slots: string[] = [];
    for (
      let mins = this.settings.openHour * 60;
      mins < this.settings.closeHour * 60;
      mins += this.settings.slotMinutes
    ) {
      const scheduledAt = clinicInstant(
        date,
        Math.floor(mins / 60),
        mins % 60,
        this.settings.timezone,
      );
      try {
        this.reserve(s, {
          id: appointment?.id || 'new',
          plan: appointment?.plan,
          scheduledAt,
        } as Appointment);
        slots.push(scheduledAt);
      } catch (e) {
        if (!(e instanceof HttpException)) throw e;
      }
    }
    return { slots, timezone: this.settings.timezone };
  }
  book(user: User, input: unknown) {
    requireOwner(user);
    const data = bookAppointmentSchema.parse(input);
    return this.store.transaction((s) => {
      const pet = find(s.pets, data.petId);
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      const appointment: Appointment = {
        ...data,
        id: id(),
        ownerId: user.id,
        status: 'AwaitingConfirmation',
        createdAt: isoNow(this.now),
        revision: 0,
      };
      this.reserve(s, appointment);
      s.appointments.push(appointment);
      return { id: appointment.id };
    });
  }
  appointment(user: User, appointmentId: string, action: string, input: unknown) {
    return this.store.transaction((s) => {
      const a = find(s.appointments, appointmentId);
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
        this.reserve(s, candidate);
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
          this.reserve(s, candidate);
          Object.assign(a, candidate);
        } else if (action === 'reschedule') {
          const data = rescheduleSchema.parse(input);
          if (a.status !== 'Confirmed') fail('Only confirmed appointments can be moved');
          this.checkRevision(a, data.revision);
          const candidate = { ...a, scheduledAt: data.scheduledAt };
          this.reserve(s, candidate);
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
          validatePlan(s, plan, a.plan?.visitTypeId);
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
          if (active(candidate) && candidate.scheduledAt) this.reserve(s, candidate, false);
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
            const product = find(s.products, used.productId);
            if (product.stock < used.quantity)
              fail(`Insufficient stock for ${product.name}. Correct the inventory first.`);
          }
          for (const used of data.actualActives)
            this.inventory.recordMovement(s, user, {
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
      return { id: a.id };
    });
  }
  private checkRevision(a: Appointment, revision: number) {
    if (a.revision !== revision) fail('This appointment changed. Refresh and try again');
  }
}
