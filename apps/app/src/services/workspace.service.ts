import type { Database } from '@vet-clinic/db';
import type { OwnerWorkspace, User, VetWorkspace } from '@vet-clinic/types';
import { clinicSettings } from '../time';
import type { PlanningPort } from '../domain/ports/planning.port';

import { active } from '../domain/rules';
import {
  appointmentInclude,
  appointmentOrder,
  caseInclude,
  toAppointment,
  toCase,
  toMovement,
  toOwnerAppointment,
  toPet,
  toTimeBlock,
  userSelect,
} from '../infrastructure/prisma/records';

const byName = [{ name: 'asc' }, { id: 'asc' }] as const;
const caseOrder = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

export class WorkspaceService {
  readonly settings;
  constructor(
    private readonly db: Database,
    private readonly ai: PlanningPort,
    private readonly now: () => number,
    timezone: string,
  ) {
    this.settings = clinicSettings(timezone);
  }
  workspace(user: User): Promise<OwnerWorkspace | VetWorkspace> {
    return user.role === 'owner' ? this.owner(user) : this.vet(user);
  }
  private owner(user: User): Promise<OwnerWorkspace> {
    return this.db.read(async (tx) => ({
      user,
      pets: (await tx.pet.findMany({ where: { ownerId: user.id }, orderBy: [...byName] })).map(
        toPet,
      ),
      appointments: (
        await tx.appointment.findMany({ where: { ownerId: user.id }, orderBy: appointmentOrder })
      ).map(toOwnerAppointment),
      cases: (
        await tx.case.findMany({
          where: { pet: { ownerId: user.id } },
          include: caseInclude,
          orderBy: [...caseOrder],
        })
      ).map(toCase),
      vets: await tx.user.findMany({
        where: { role: 'vet' },
        select: { id: true, name: true },
        orderBy: [...byName],
      }),
      clinic: this.settings,
    }));
  }
  private vet(user: User): Promise<VetWorkspace> {
    return this.db.read(async (tx) => {
      const appointments = (
        await tx.appointment.findMany({ include: appointmentInclude, orderBy: appointmentOrder })
      ).map(toAppointment);
      const users = await tx.user.findMany({ select: userSelect, orderBy: [...byName] });
      const products = await tx.product.findMany({ orderBy: [...byName] });
      const upcoming = appointments.filter(
        (a) =>
          a.status === 'NeedsTime' ||
          (active(a) && a.scheduledAt && Date.parse(a.scheduledAt) >= this.now()),
      );
      const completed = appointments.filter((a) => a.status === 'Done');
      const reviewed = appointments.filter((a) => a.plan?.source === 'ai-reviewed');
      const kept = reviewed.filter((a) => {
        const p = a.plan!;
        const d = p.originalDraft;
        return (
          d &&
          d.visitTypeId === p.visitTypeId &&
          Math.abs(p.durationMinutes - d.durationMinutes) <= 15 &&
          JSON.stringify(p.estimatedActives) === JSON.stringify(d.estimatedActives)
        );
      });
      return {
        user,
        pets: (await tx.pet.findMany({ orderBy: [...byName] })).map(toPet),
        appointments,
        cases: (await tx.case.findMany({ include: caseInclude, orderBy: [...caseOrder] })).map(
          toCase,
        ),
        vets: users.filter((u) => u.role === 'vet'),
        owners: users.filter((u) => u.role === 'owner'),
        products: products.map((p) => ({
          ...p,
          needed: upcoming.reduce(
            (sum, a) =>
              sum + (a.plan?.estimatedActives.find((x) => x.productId === p.id)?.quantity || 0),
            0,
          ),
        })),
        movements: (
          await tx.movement.findMany({ orderBy: [{ performedAt: 'asc' }, { id: 'asc' }] })
        ).map(toMovement),
        visitTypes: await tx.visitType.findMany({ orderBy: [...byName] }),
        timeBlocks: (
          await tx.timeBlock.findMany({ orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] })
        ).map(toTimeBlock),
        clinic: this.settings,
        aiAvailable: this.ai.available,
        metrics: {
          completedVisits: completed.length,
          plannedBeforeVisitPercent: completed.length
            ? Math.round(
                (100 *
                  completed.filter(
                    (a) =>
                      a.plan &&
                      a.scheduledAt &&
                      Date.parse(a.plan.savedAt) < Date.parse(a.scheduledAt),
                  ).length) /
                  completed.length,
              )
            : 0,
          aiKeptWithMinorEditsPercent: reviewed.length
            ? Math.round((100 * kept.length) / reviewed.length)
            : 0,
        },
      };
    });
  }
}
