import type {
  Appointment,
  AppointmentStatus,
  EstimatedActive,
  OwnerAppointment,
  VisitPlan,
} from '@vet-clinic/types';
import { MAX_VISIT_MINUTES } from '@vet-clinic/validation';
import { fail } from '../../../domain/rules';
import {
  appointmentColumns,
  appointmentInclude,
  appointmentOrder,
  positioned,
  toAppointment,
  toOwnerAppointment,
} from '../records';
import { BaseRepository } from './base.repository';

/** Scalar fields an action may change. `update` bumps the revision itself. */
export interface AppointmentChanges {
  status?: AppointmentStatus;
  vetId?: string | null;
  scheduledAt?: string | null;
  completedAt?: string;
}

/** A visit as the scheduler sees it: who, when and for how long. */
export interface ScheduledVisit {
  id: string;
  vetId: string | null;
  scheduledAt: string;
  durationMinutes: number;
}

/**
 * An appointment is one row plus its plan, AI draft and product lists in five more tables.
 * Reads return it assembled; each write touches only the tables that action changes.
 */
export class AppointmentsRepository extends BaseRepository<Appointment> {
  async find(appointmentId: string) {
    const row = await this.tx.appointment.findUnique({
      where: { id: appointmentId },
      include: appointmentInclude,
    });
    return row && toAppointment(row);
  }
  async findMany(appointmentIds: string[]): Promise<Appointment[]> {
    return (
      await this.tx.appointment.findMany({
        where: { id: { in: appointmentIds } },
        include: appointmentInclude,
      })
    ).map(toAppointment);
  }
  /** Every appointment, oldest request first. */
  async list(): Promise<Appointment[]> {
    return (
      await this.tx.appointment.findMany({ include: appointmentInclude, orderBy: appointmentOrder })
    ).map(toAppointment);
  }
  /** An owner's appointments without plans, product usage or revisions. */
  async listForOwner(ownerId: string): Promise<OwnerAppointment[]> {
    return (
      await this.tx.appointment.findMany({ where: { ownerId }, orderBy: appointmentOrder })
    ).map(toOwnerAppointment);
  }

  /** Visits in `statuses` that could overlap the instants [from, to). */
  async scheduledNear(
    from: number,
    to: number,
    statuses: AppointmentStatus[],
  ): Promise<ScheduledVisit[]> {
    const rows = await this.tx.appointment.findMany({
      where: {
        status: { in: statuses },
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
    return rows.map((a) => ({
      id: a.id,
      vetId: a.vetId,
      scheduledAt: a.scheduledAt!,
      durationMinutes: a.plan?.durationMinutes || 30,
    }));
  }

  /** Inserts a new appointment with any plan and recorded usage it already carries. */
  async create(appointment: Appointment) {
    await this.tx.appointment.create({ data: appointmentColumns(appointment) });
    if (appointment.plan) await this.replacePlan(appointment.id, appointment.plan);
    if (appointment.actualActives?.length)
      await this.writeUsage(appointment.id, appointment.actualActives);
  }

  /**
   * Applies `changes` and bumps the revision, but only if the stored revision is still
   * `appointment.revision`; otherwise someone else changed it first and this fails with 409.
   */
  async update(appointment: { id: string; revision: number }, changes: AppointmentChanges = {}) {
    const { count } = await this.tx.appointment.updateMany({
      where: { id: appointment.id, revision: appointment.revision },
      data: { ...changes, revision: { increment: 1 } },
    });
    if (!count) fail('This appointment changed. Refresh and try again');
  }

  /** Saves a plan in place of the current one; its estimates and AI draft cascade with it. */
  async replacePlan(appointmentId: string, plan: VisitPlan) {
    await this.tx.appointmentPlan.deleteMany({ where: { appointmentId } });
    const draft = plan.originalDraft;
    await this.tx.appointmentPlan.create({
      data: {
        appointmentId,
        visitTypeId: plan.visitTypeId,
        durationMinutes: plan.durationMinutes,
        source: plan.source,
        reviewedBy: plan.reviewedBy ?? null,
        savedAt: plan.savedAt,
        estimatedActives: { create: positioned(plan.estimatedActives) },
        ...(draft
          ? {
              originalDraft: {
                create: {
                  visitTypeId: draft.visitTypeId,
                  durationMinutes: draft.durationMinutes,
                  estimatedActives: { create: positioned(draft.estimatedActives) },
                },
              },
            }
          : {}),
      },
    });
  }

  /** Records what a visit actually used. An empty list still counts as recorded. */
  async recordUsage(appointmentId: string, actives: EstimatedActive[]) {
    await this.writeUsage(appointmentId, actives);
    await this.tx.appointment.update({
      where: { id: appointmentId },
      data: { actualActivesRecorded: true },
    });
  }
  private async writeUsage(appointmentId: string, actives: EstimatedActive[]) {
    await this.tx.appointmentActualActive.createMany({
      data: positioned(actives).map((row) => ({ ...row, appointmentId })),
    });
  }

  /** Makes the appointment checkpoint number `order` of a case. */
  async attachToCase(appointmentId: string, caseId: string, order: number) {
    await this.tx.appointment.update({
      where: { id: appointmentId },
      data: { caseId, checkpointOrder: order, petNeeded: true, revision: { increment: 1 } },
    });
  }

  /** Report rows for visits in [from, to); unscheduled ones count by request date. */
  forReport(range: { gte: string; lt: string }, filters: { ownerId?: string; petId?: string }) {
    return this.tx.appointment.findMany({
      where: {
        OR: [{ scheduledAt: range }, { scheduledAt: null, createdAt: range }],
        ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
        ...(filters.petId ? { petId: filters.petId } : {}),
      },
      select: {
        scheduledAt: true,
        createdAt: true,
        status: true,
        pet: { select: { name: true } },
        owner: { select: { name: true } },
        vet: { select: { name: true } },
        plan: { select: { durationMinutes: true, visitType: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
}
