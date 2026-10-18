import type { OwnerWorkspace, User, VetWorkspace } from '@vet-clinic/types';
import { clinicSettings } from '../time';
import type { PlanningPort } from '../domain/ports/planning.port';

import { active } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';

export class WorkspaceService {
  readonly settings;
  constructor(
    private readonly store: Store,
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
    return this.store.read(async (repos) => ({
      user,
      pets: await repos.pets.listByOwner(user.id),
      appointments: await repos.appointments.listForOwner(user.id),
      cases: await repos.cases.listByOwner(user.id),
      vets: await repos.users.vets(),
      clinic: this.settings,
    }));
  }
  private vet(user: User): Promise<VetWorkspace> {
    return this.store.read(async (repos) => {
      const appointments = await repos.appointments.list();
      const users = await repos.users.list();
      const products = await repos.products.list();
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
        pets: await repos.pets.list(),
        appointments,
        cases: await repos.cases.list(),
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
        movements: await repos.movements.list(),
        visitTypes: await repos.visitTypes.list(),
        timeBlocks: await repos.timeBlocks.list(),
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
