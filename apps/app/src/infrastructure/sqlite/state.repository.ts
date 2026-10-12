import type { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import type { Appointment, Case, EstimatedActive, PlanInput, VisitPlan } from '@vet-clinic/types';
import type { State } from './entities';
import { TableRepository } from './table.repository';

type AppointmentRecord = Omit<Appointment, 'plan' | 'actualActives'> & {
  actualActivesRecorded: boolean;
};
type CaseRecord = Omit<Case, 'checkpointIds'>;
type ActivesTable =
  'appointment_estimated_actives' | 'appointment_draft_actives' | 'appointment_actual_actives';

export function emptyState(): State {
  return {
    users: [],
    sessions: [],
    pets: [],
    appointments: [],
    cases: [],
    products: [],
    movements: [],
    visitTypes: [],
    timeBlocks: [],
  };
}

/** Maps relational rows to domain entities without changing the public API contracts. */
export class StateRepository {
  private readonly users;
  private readonly sessions;
  private readonly pets;
  private readonly appointments;
  private readonly cases;
  private readonly products;
  private readonly movements;
  private readonly visitTypes;
  private readonly timeBlocks;

  constructor(private readonly db: DatabaseSync) {
    this.users = new TableRepository<State['users'][number]>(db, 'users', [
      ['id', 'id'],
      ['name', 'name'],
      ['email', 'email'],
      ['role', 'role'],
      ['passwordHash', 'password_hash'],
    ]);
    this.sessions = new TableRepository<State['sessions'][number]>(db, 'sessions', [
      ['id', 'id'],
      ['userId', 'user_id'],
      ['expiresAt', 'expires_at'],
    ]);
    this.pets = new TableRepository<State['pets'][number]>(db, 'pets', [
      ['id', 'id'],
      ['ownerId', 'owner_id'],
      ['name', 'name'],
      ['species', 'species'],
      ['sex', 'sex'],
      ['dateOfBirth', 'date_of_birth'],
      ['approximateAge', 'approximate_age'],
      ['breed', 'breed'],
      ['weight', 'weight'],
      ['notes', 'notes'],
    ]);
    this.appointments = new TableRepository<AppointmentRecord>(db, 'appointments', [
      ['id', 'id'],
      ['petId', 'pet_id'],
      ['ownerId', 'owner_id'],
      ['vetId', 'vet_id'],
      ['scheduledAt', 'scheduled_at'],
      ['symptoms', 'symptoms'],
      ['status', 'status'],
      ['caseId', 'case_id'],
      ['checkpointOrder', 'checkpoint_order'],
      ['petNeeded', 'pet_needed', 'boolean'],
      ['createdAt', 'created_at'],
      ['completedAt', 'completed_at'],
      ['revision', 'revision'],
      ['actualActivesRecorded', 'actual_actives_recorded', 'boolean'],
    ]);
    this.cases = new TableRepository<CaseRecord>(db, 'cases', [
      ['id', 'id'],
      ['petId', 'pet_id'],
      ['name', 'name'],
      ['createdAt', 'created_at'],
    ]);
    this.products = new TableRepository<State['products'][number]>(db, 'products', [
      ['id', 'id'],
      ['name', 'name'],
      ['unit', 'unit'],
      ['stock', 'stock'],
    ]);
    this.movements = new TableRepository<State['movements'][number]>(db, 'movements', [
      ['id', 'id'],
      ['productId', 'product_id'],
      ['type', 'type'],
      ['quantity', 'quantity'],
      ['reason', 'reason'],
      ['performedBy', 'performed_by'],
      ['performedAt', 'performed_at'],
      ['appointmentId', 'appointment_id'],
    ]);
    this.visitTypes = new TableRepository<State['visitTypes'][number]>(db, 'visit_types', [
      ['id', 'id'],
      ['name', 'name'],
      ['retired', 'retired', 'boolean'],
    ]);
    this.timeBlocks = new TableRepository<State['timeBlocks'][number]>(db, 'time_blocks', [
      ['id', 'id'],
      ['startsAt', 'starts_at'],
      ['endsAt', 'ends_at'],
      ['reason', 'reason'],
    ]);
  }

  read(): State {
    const estimated = this.readActives('appointment_estimated_actives');
    const drafts = this.readActives('appointment_draft_actives');
    const actual = this.readActives('appointment_actual_actives');
    const originalDrafts = new Map<string, PlanInput>();
    for (const row of this.db.prepare('SELECT * FROM appointment_ai_drafts').all()) {
      const id = row.appointment_id as string;
      originalDrafts.set(id, {
        visitTypeId: row.visit_type_id as string,
        durationMinutes: row.duration_minutes as number,
        estimatedActives: drafts.get(id) || [],
      });
    }
    const plans = new Map<string, VisitPlan>();
    for (const row of this.db.prepare('SELECT * FROM appointment_plans').all()) {
      const id = row.appointment_id as string;
      const originalDraft = originalDrafts.get(id);
      plans.set(id, {
        visitTypeId: row.visit_type_id as string,
        durationMinutes: row.duration_minutes as number,
        source: row.source as VisitPlan['source'],
        savedAt: row.saved_at as string,
        estimatedActives: estimated.get(id) || [],
        ...(row.reviewed_by === null ? {} : { reviewedBy: row.reviewed_by as string }),
        ...(originalDraft ? { originalDraft } : {}),
      });
    }
    const appointments = this.appointments
      .read()
      .map(({ actualActivesRecorded, ...appointment }) => {
        const plan = plans.get(appointment.id);
        return {
          ...appointment,
          ...(plan ? { plan } : {}),
          ...(actualActivesRecorded ? { actualActives: actual.get(appointment.id) || [] } : {}),
        };
      });
    const checkpoints = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      if (!appointment.caseId) continue;
      const list = checkpoints.get(appointment.caseId) || [];
      list.push(appointment);
      checkpoints.set(appointment.caseId, list);
    }
    return {
      users: this.users.read(),
      sessions: this.sessions.read(),
      pets: this.pets.read(),
      appointments,
      cases: this.cases.read().map((careCase) => ({
        ...careCase,
        checkpointIds: (checkpoints.get(careCase.id) || [])
          .sort((a, b) => a.checkpointOrder! - b.checkpointOrder!)
          .map((appointment) => appointment.id),
      })),
      products: this.products.read(),
      movements: this.movements.read(),
      visitTypes: this.visitTypes.read(),
      timeBlocks: this.timeBlocks.read(),
    };
  }

  synchronize(before: State, after: State): void {
    this.validateCheckpoints(after);
    this.users.synchronize(before.users, after.users);
    this.sessions.synchronize(before.sessions, after.sessions);
    this.pets.synchronize(before.pets, after.pets);
    this.cases.synchronize(this.caseRecords(before), this.caseRecords(after));
    this.appointments.synchronize(this.appointmentRecords(before), this.appointmentRecords(after));
    this.products.synchronize(before.products, after.products);
    this.movements.synchronize(before.movements, after.movements);
    this.visitTypes.synchronize(before.visitTypes, after.visitTypes);
    this.timeBlocks.synchronize(before.timeBlocks, after.timeBlocks);
    const previous = new Map(
      before.appointments.map((appointment) => [appointment.id, appointment]),
    );
    for (const appointment of after.appointments) {
      const old = previous.get(appointment.id);
      if (!isDeepStrictEqual(old?.plan, appointment.plan)) this.writePlan(appointment);
      if (!isDeepStrictEqual(old?.actualActives, appointment.actualActives)) {
        this.db
          .prepare('DELETE FROM appointment_actual_actives WHERE appointment_id=?')
          .run(appointment.id);
        this.writeActives(
          'appointment_actual_actives',
          appointment.id,
          appointment.actualActives || [],
        );
      }
    }
  }

  private caseRecords(state: State): CaseRecord[] {
    return state.cases.map(({ checkpointIds: _checkpointIds, ...careCase }) => careCase);
  }

  private appointmentRecords(state: State): AppointmentRecord[] {
    return state.appointments.map(({ plan: _plan, actualActives, ...appointment }) => ({
      ...appointment,
      actualActivesRecorded: actualActives !== undefined,
    }));
  }

  private validateCheckpoints(state: State): void {
    for (const careCase of state.cases) {
      const appointments = state.appointments
        .filter((appointment) => appointment.caseId === careCase.id)
        .sort((a, b) => a.checkpointOrder! - b.checkpointOrder!);
      if (
        !isDeepStrictEqual(
          careCase.checkpointIds,
          appointments.map((appointment) => appointment.id),
        )
      )
        throw new Error('Case checkpoint IDs must match the ordered appointment relationships');
    }
  }

  private readActives(table: ActivesTable): Map<string, EstimatedActive[]> {
    const result = new Map<string, EstimatedActive[]>();
    for (const row of this.db
      .prepare(`SELECT * FROM ${table} ORDER BY appointment_id, position`)
      .all()) {
      const id = row.appointment_id as string;
      const list = result.get(id) || [];
      list.push({ productId: row.product_id as string, quantity: row.quantity as number });
      result.set(id, list);
    }
    return result;
  }

  private writeActives(
    table: ActivesTable,
    appointmentId: string,
    actives: EstimatedActive[],
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO ${table} (appointment_id, position, product_id, quantity) VALUES (?, ?, ?, ?)`,
    );
    actives.forEach((active, position) =>
      insert.run(appointmentId, position, active.productId, active.quantity),
    );
  }

  private writePlan(appointment: Appointment): void {
    // Replacing one plan cascades only to its estimates and original draft rows.
    this.db.prepare('DELETE FROM appointment_plans WHERE appointment_id=?').run(appointment.id);
    const plan = appointment.plan;
    if (!plan) return;
    this.db
      .prepare(
        `INSERT INTO appointment_plans
      (appointment_id, visit_type_id, duration_minutes, source, reviewed_by, saved_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        appointment.id,
        plan.visitTypeId,
        plan.durationMinutes,
        plan.source,
        plan.reviewedBy ?? null,
        plan.savedAt,
      );
    this.writeActives('appointment_estimated_actives', appointment.id, plan.estimatedActives);
    if (plan.originalDraft) {
      this.db
        .prepare(
          `INSERT INTO appointment_ai_drafts (appointment_id, visit_type_id, duration_minutes) VALUES (?, ?, ?)`,
        )
        .run(appointment.id, plan.originalDraft.visitTypeId, plan.originalDraft.durationMinutes);
      this.writeActives(
        'appointment_draft_actives',
        appointment.id,
        plan.originalDraft.estimatedActives,
      );
    }
  }
}
