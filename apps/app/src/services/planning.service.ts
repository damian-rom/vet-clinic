import { draftBatchSchema } from '@vet-clinic/validation';
import { z } from 'zod';
import type { Database } from '@vet-clinic/db';
import type { Appointment, User } from '@vet-clinic/types';
import { visitPlanSchema } from '@vet-clinic/validation';
import type { PlanningPort } from '../domain/ports/planning.port';

import { active, requireVet, required, isoNow, validatePlan } from '../domain/rules';
import {
  appointmentInclude,
  saveAppointment,
  toAppointment,
  toPet,
} from '../infrastructure/prisma/records';
import { AppointmentsService } from './appointments.service';

const finished = (a: Appointment) =>
  a.status === 'Done' || a.status === 'Cancelled' || (a.plan && a.plan.source !== 'ai-draft');

export class PlanningService {
  constructor(
    private readonly db: Database,
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
      const context = await this.db.read(async (tx) => {
        const a = toAppointment(
          required(
            await tx.appointment.findUnique({ where: { id: key }, include: appointmentInclude }),
          ),
        );
        if (finished(a)) return undefined;
        return {
          a,
          pet: toPet(required(await tx.pet.findUnique({ where: { id: a.petId } }))),
          visitTypes: await tx.visitType.findMany({
            where: { retired: false },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
          }),
          products: await tx.product.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
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
        const outcome = await this.db.write(async (tx) => {
          const current = toAppointment(
            required(
              await tx.appointment.findUnique({ where: { id: key }, include: appointmentInclude }),
            ),
          );
          if (current.revision !== a.revision || finished(current)) return 'skipped' as const;
          await validatePlan(tx, plan);
          const candidate: Appointment = {
            ...current,
            plan: { ...plan, source: 'ai-draft', originalDraft: plan, savedAt: isoNow(this.now) },
            revision: current.revision + 1,
          };
          if (candidate.scheduledAt && active(candidate))
            await this.appointments.reserve(tx, candidate, false);
          await saveAppointment(tx, current, candidate);
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
