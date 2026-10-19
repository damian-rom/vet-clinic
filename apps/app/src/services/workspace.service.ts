import { z } from 'zod';
import type { AppointmentHistoryPage, OwnerWorkspace, User, VetWorkspace } from '@vet-clinic/types';
import { clinicSettings } from '../time';
import type { PlanningPort } from '../domain/ports/planning.port';

import { active, requireVet } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';

/** Closed visits stay in the vet workspace this long; older ones load on request. */
const HISTORY_DAYS = 30;
/** Midnight UTC, HISTORY_DAYS ago: stable all day, so periodic refreshes agree on it. */
const windowStart = (now: number) =>
  new Date(Math.floor(now / 86400_000 - HISTORY_DAYS) * 86400_000).toISOString();

const historyQuerySchema = z
  .object({
    before: z.string().datetime(),
    petId: z.string().min(1).optional(),
    cursor: z
      .string()
      .regex(/^[^|]+\|[^|]+$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

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
    const historySince = windowStart(this.now());
    return this.store.read(async (repos) => {
      const appointments = await repos.appointments.listRecent(historySince);
      const users = await repos.users.list();
      const products = await repos.products.list();
      // Every open visit is in the window, so stock needs are complete.
      const upcoming = appointments.filter(
        (a) =>
          a.status === 'NeedsTime' ||
          (active(a) && a.scheduledAt && Date.parse(a.scheduledAt) >= this.now()),
      );
      const metrics = await repos.appointments.metrics();
      const percent = (part: number, whole: number) =>
        whole ? Math.round((100 * part) / whole) : 0;
      return {
        user,
        pets: await repos.pets.list(),
        appointments,
        historySince,
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
        weeklyTimeBlocks: await repos.weeklyTimeBlocks.list(),
        clinic: this.settings,
        aiAvailable: this.ai.available,
        metrics: {
          completedVisits: metrics.completed,
          plannedBeforeVisitPercent: percent(metrics.plannedBefore, metrics.completed),
          aiKeptWithMinorEditsPercent: percent(metrics.kept, metrics.reviewed),
        },
      };
    });
  }
  /** Closed visits older than the workspace window, a page at a time. */
  async history(user: User, query: unknown): Promise<AppointmentHistoryPage> {
    requireVet(user);
    const { before, petId, cursor, limit } = historyQuerySchema.parse(query);
    return this.store.read((repos) =>
      repos.appointments.closedBefore(before, { petId, cursor, limit }),
    );
  }
}
