import { draftBatchSchema } from '@vet-clinic/validation';
import { z } from 'zod';
import type { Appointment, User } from '@vet-clinic/types';
import { visitPlanSchema } from '@vet-clinic/validation';
import { Store } from '../infrastructure/sqlite/store';
import type { PlanningPort } from '../domain/ports/planning.port';

import { active, requireVet, find, isoNow, validatePlan } from '../domain/rules';
import { AppointmentsService } from './appointments.service';
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
      const s = this.store.read();
      const a = find(s.appointments, key);
      if (
        a.status === 'Done' ||
        a.status === 'Cancelled' ||
        (a.plan && a.plan.source !== 'ai-draft')
      ) {
        results.push({ id: key, outcome: 'skipped' });
        continue;
      }
      try {
        const plan = visitPlanSchema.parse(
          await this.ai.draft({
            pet: find(s.pets, a.petId),
            symptoms: a.symptoms,
            visitTypes: s.visitTypes.filter((t) => !t.retired),
            products: s.products,
          }),
        );
        const outcome = this.store.transaction((state) => {
          const current = find(state.appointments, key);
          if (
            current.revision !== a.revision ||
            current.status === 'Done' ||
            current.status === 'Cancelled' ||
            (current.plan && current.plan.source !== 'ai-draft')
          )
            return 'skipped' as const;
          validatePlan(state, plan);
          const candidate: Appointment = {
            ...current,
            plan: { ...plan, source: 'ai-draft', originalDraft: plan, savedAt: isoNow(this.now) },
          };
          if (candidate.scheduledAt && active(candidate))
            this.appointments.reserve(state, candidate, false);
          Object.assign(current, candidate);
          current.revision++;
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
