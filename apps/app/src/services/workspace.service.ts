import type { OwnerWorkspace, User, VetWorkspace } from '@vet-clinic/types';
import { Store } from '../infrastructure/sqlite/store';
import { clinicSettings } from '../time';
import type { PlanningPort } from '../domain/ports/planning.port';

import { publicUser, active } from '../domain/rules';
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
  workspace(user: User): OwnerWorkspace | VetWorkspace {
    const s = this.store.read();
    const vets = s.users.filter((u) => u.role === 'vet').map(publicUser);
    if (user.role === 'owner') {
      const pets = s.pets.filter((p) => p.ownerId === user.id);
      const petIds = new Set(pets.map((p) => p.id));
      return {
        user,
        pets,
        appointments: s.appointments
          .filter((a) => a.ownerId === user.id)
          .map((a) => {
            const { plan: _plan, actualActives: _actual, revision: _revision, ...owner } = a;
            return owner;
          }),
        cases: s.cases.filter((c) => petIds.has(c.petId)),
        vets: vets.map(({ id, name }) => ({ id, name })),
        clinic: this.settings,
      };
    }
    const completed = s.appointments.filter((a) => a.status === 'Done');
    const reviewed = s.appointments.filter((a) => a.plan?.source === 'ai-reviewed');
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
      pets: s.pets,
      appointments: s.appointments,
      cases: s.cases,
      vets,
      owners: s.users.filter((u) => u.role === 'owner').map(publicUser),
      products: s.products.map((p) => ({
        ...p,
        needed: s.appointments
          .filter(
            (a) =>
              a.status === 'NeedsTime' ||
              (active(a) && a.scheduledAt && Date.parse(a.scheduledAt) >= this.now()),
          )
          .reduce(
            (sum, a) =>
              sum + (a.plan?.estimatedActives.find((x) => x.productId === p.id)?.quantity || 0),
            0,
          ),
      })),
      movements: s.movements,
      visitTypes: s.visitTypes,
      timeBlocks: s.timeBlocks,
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
  }
}
