import type { Prisma } from '@vet-clinic/db';
import type {
  Appointment,
  Case,
  EstimatedActive,
  OwnerAppointment,
  Pet,
  PlanSource,
  StockMovement,
  TimeBlock,
  User,
  VisitPlan,
  WeeklyTimeBlock,
} from '@vet-clinic/types';

/** SQL NULL represents an omitted optional entity property. */
function present<T extends object>(row: T) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
}

/**
 * Nested lists load unordered: Prisma cannot split an ordered relation load into batches, and
 * SQLite rejects one query with a parameter per appointment past ~1000 rows. The mappers sort.
 */
export const appointmentInclude = {
  plan: {
    include: {
      estimatedActives: true,
      originalDraft: { include: { estimatedActives: true } },
    },
  },
  actualActives: true,
} satisfies Prisma.AppointmentInclude;

/** Appointments in the order they were requested. */
export const appointmentOrder = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.AppointmentOrderByWithRelationInput[];

export const caseInclude = {
  checkpoints: { select: { id: true, checkpointOrder: true } },
} satisfies Prisma.CaseInclude;

export const userSelect = { id: true, name: true, email: true, role: true } as const;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;
type PlanRow = NonNullable<AppointmentRow['plan']>;
type CaseRow = Prisma.CaseGetPayload<{ include: typeof caseInclude }>;
type ActiveRow = { productId: string; quantity: number; position: number };

const toActives = (rows: ActiveRow[]): EstimatedActive[] =>
  [...rows]
    .sort((a, b) => a.position - b.position)
    .map(({ productId, quantity }) => ({ productId, quantity }));

function toPlan(row: PlanRow): VisitPlan {
  return {
    visitTypeId: row.visitTypeId,
    durationMinutes: row.durationMinutes,
    estimatedActives: toActives(row.estimatedActives),
    source: row.source as PlanSource,
    savedAt: row.savedAt,
    ...(row.reviewedBy === null ? {} : { reviewedBy: row.reviewedBy }),
    ...(row.originalDraft
      ? {
          originalDraft: {
            visitTypeId: row.originalDraft.visitTypeId,
            durationMinutes: row.originalDraft.durationMinutes,
            estimatedActives: toActives(row.originalDraft.estimatedActives),
          },
        }
      : {}),
  };
}

export function toAppointment(row: AppointmentRow): Appointment {
  const { plan, actualActives, actualActivesRecorded, ...fields } = row;
  return {
    ...(present(fields) as Omit<Appointment, 'plan' | 'actualActives'>),
    ...(plan ? { plan: toPlan(plan) } : {}),
    ...(actualActivesRecorded ? { actualActives: toActives(actualActives) } : {}),
  };
}

/** Owners never receive plans, actual usage or revisions. */
export function toOwnerAppointment({
  revision: _revision,
  actualActivesRecorded: _recorded,
  ...fields
}: Prisma.AppointmentGetPayload<object>): OwnerAppointment {
  return present(fields) as unknown as OwnerAppointment;
}

export const toCase = ({ checkpoints, ...fields }: CaseRow): Case => ({
  ...fields,
  checkpointIds: [...checkpoints]
    .sort((a, b) => a.checkpointOrder! - b.checkpointOrder!)
    .map((appointment) => appointment.id),
});
export const toPet = (row: Prisma.PetGetPayload<object>) => present(row) as unknown as Pet;
export const toMovement = (row: Prisma.MovementGetPayload<object>) =>
  present(row) as unknown as StockMovement;
export const toTimeBlock = (row: Prisma.TimeBlockGetPayload<object>) =>
  present(row) as unknown as TimeBlock;
export const toWeeklyTimeBlock = (row: Prisma.WeeklyTimeBlockGetPayload<object>) =>
  present(row) as unknown as WeeklyTimeBlock;
export const toUser = ({ id, name, email, role }: User): User => ({ id, name, email, role });

/** Scalar appointment columns; repositories write nested plans and usage separately. */
export function appointmentColumns(appointment: Appointment) {
  return {
    id: appointment.id,
    petId: appointment.petId,
    ownerId: appointment.ownerId,
    vetId: appointment.vetId ?? null,
    scheduledAt: appointment.scheduledAt ?? null,
    symptoms: appointment.symptoms,
    status: appointment.status,
    caseId: appointment.caseId ?? null,
    checkpointOrder: appointment.checkpointOrder ?? null,
    petNeeded: appointment.petNeeded ?? null,
    createdAt: appointment.createdAt,
    completedAt: appointment.completedAt ?? null,
    revision: appointment.revision,
    actualActivesRecorded: appointment.actualActives !== undefined,
  };
}

/** Product lists keep their order through an explicit position column. */
export const positioned = (actives: EstimatedActive[]) =>
  actives.map(({ productId, quantity }, position) => ({ position, productId, quantity }));
