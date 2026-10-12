import { isDeepStrictEqual } from 'node:util';
import type { Prisma, Tx } from '@vet-clinic/db';
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
} from '@vet-clinic/types';

/** SQL NULL represents an omitted optional entity property. */
function present<T extends object>(row: T) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
}

const byPosition = { orderBy: { position: 'asc' } } as const;

export const appointmentInclude = {
  plan: {
    include: {
      estimatedActives: byPosition,
      originalDraft: { include: { estimatedActives: byPosition } },
    },
  },
  actualActives: byPosition,
} satisfies Prisma.AppointmentInclude;

/** Appointments in the order they were requested. */
export const appointmentOrder = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.AppointmentOrderByWithRelationInput[];

export const caseInclude = {
  checkpoints: { select: { id: true }, orderBy: { checkpointOrder: 'asc' } },
} satisfies Prisma.CaseInclude;

export const userSelect = { id: true, name: true, email: true, role: true } as const;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;
type PlanRow = NonNullable<AppointmentRow['plan']>;
type CaseRow = Prisma.CaseGetPayload<{ include: typeof caseInclude }>;
type ActiveRow = { productId: string; quantity: number };

const toActives = (rows: ActiveRow[]): EstimatedActive[] =>
  rows.map(({ productId, quantity }) => ({ productId, quantity }));

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
  checkpointIds: checkpoints.map((appointment) => appointment.id),
});
export const toPet = (row: Prisma.PetGetPayload<object>) => present(row) as unknown as Pet;
export const toMovement = (row: Prisma.MovementGetPayload<object>) =>
  present(row) as unknown as StockMovement;
export const toTimeBlock = (row: Prisma.TimeBlockGetPayload<object>) =>
  present(row) as unknown as TimeBlock;
export const toUser = ({ id, name, email, role }: User): User => ({ id, name, email, role });

/** Scalar appointment columns; nested plans and usage are written separately. */
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

const positioned = (actives: EstimatedActive[]) =>
  actives.map(({ productId, quantity }, position) => ({ position, productId, quantity }));

/** Replacing a plan cascades only to its estimates and original draft rows. */
async function writePlan(tx: Tx, appointmentId: string, plan?: VisitPlan) {
  await tx.appointmentPlan.deleteMany({ where: { appointmentId } });
  if (!plan) return;
  const draft = plan.originalDraft;
  await tx.appointmentPlan.create({
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

export async function createAppointment(tx: Tx, appointment: Appointment) {
  await tx.appointment.create({ data: appointmentColumns(appointment) });
  if (appointment.plan) await writePlan(tx, appointment.id, appointment.plan);
  if (appointment.actualActives?.length)
    await tx.appointmentActualActive.createMany({
      data: positioned(appointment.actualActives).map((row) => ({
        ...row,
        appointmentId: appointment.id,
      })),
    });
}

/** Writes only the parts of an appointment that changed. */
export async function saveAppointment(tx: Tx, before: Appointment, after: Appointment) {
  await tx.appointment.update({ where: { id: after.id }, data: appointmentColumns(after) });
  if (!isDeepStrictEqual(before.plan, after.plan)) await writePlan(tx, after.id, after.plan);
  if (!isDeepStrictEqual(before.actualActives, after.actualActives)) {
    await tx.appointmentActualActive.deleteMany({ where: { appointmentId: after.id } });
    await tx.appointmentActualActive.createMany({
      data: positioned(after.actualActives || []).map((row) => ({
        ...row,
        appointmentId: after.id,
      })),
    });
  }
}
