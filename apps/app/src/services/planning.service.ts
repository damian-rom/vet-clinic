import { draftBatchSchema } from '@vet-clinic/validation';
import { z } from 'zod';
import type { Appointment, User, VisitPlan } from '@vet-clinic/types';
import { visitPlanSchema } from '@vet-clinic/validation';
import type { PlanningPort } from '../domain/ports/planning.port';

import { active, requireVet, isoNow, validatePlan } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';
import { AppointmentsService } from './appointments.service';

const finished = (a: Appointment) =>
  a.status === 'Done' || a.status === 'Cancelled' || (a.plan && a.plan.source !== 'ai-draft');

export class PlanningService {
  constructor(
    private readonly store: Store,
    private readonly ai: PlanningPort,
    private readonly appointments: AppointmentsService,
    private readonly now: () => number,
  ) {}
  async draft(user: User, input: unknown) {
    requireVet(user);
    const { appointmentIds } = draftBatchSchema.parse(input);
    const results: {
      id: string;
      outcome: 'drafted' | 'skipped' | 'failed';
      message?: string;
    }[] = [];
    for (const key of [...new Set(appointmentIds)]) {
      const context = await this.store.read(async (repos) => {
        const a = await repos.appointments.get(key);
        if (finished(a)) return undefined;
        return {
          a,
          pet: await repos.pets.get(a.petId),
          visitTypes: await repos.visitTypes.listActive(),
          products: await repos.products.list(),
        };
      });
      if (!context) {
        results.push({ id: key, outcome: 'skipped' });
        continue;
      }
      const { a, pet, visitTypes, products } = context;
      try {
        const plan = visitPlanSchema.parse(
          await this.ai.draft({ pet, symptoms: a.symptoms, visitTypes, products }),
        );
        // The AI call ran outside any transaction; skip if the visit changed meanwhile.
        const outcome = await this.store.write(async (repos) => {
          const current = await repos.appointments.get(key);
          if (current.revision !== a.revision || finished(current)) return 'skipped' as const;
          await validatePlan(repos, plan);
          const draft: VisitPlan = {
            ...plan,
            source: 'ai-draft',
            originalDraft: plan,
            savedAt: isoNow(this.now),
          };
          if (current.scheduledAt && active(current))
            await this.appointments.reserve(repos, { ...current, plan: draft }, false);
          await repos.appointments.replacePlan(key, draft);
          await repos.appointments.update(current);
          return 'drafted' as const;
        });
        results.push({ id: key, outcome });
      } catch (error) {
        results.push({
          id: key,
          outcome: 'failed',
          message:
            error instanceof z.ZodError
              ? 'AI returned an invalid plan. Your plan was not changed.'
              : error instanceof Error
                ? error.message
                : 'AI drafting failed',
        });
      }
    }
    return { results };
  }
}
