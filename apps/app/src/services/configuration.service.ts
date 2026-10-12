import type { Database } from '@vet-clinic/db';
import type { User } from '@vet-clinic/types';
import { MAX_VISIT_MINUTES, timeBlockSchema, visitTypeSchema } from '@vet-clinic/validation';
import { endOf, overlaps } from '../time';
import { fail, id, requireVet, required } from '../domain/rules';
import { toTimeBlock } from '../infrastructure/prisma/records';
export class ConfigurationService {
  constructor(
    private readonly db: Database,
    private readonly now: () => number,
  ) {}
  async visitType(user: User, input: unknown, key?: string) {
    requireVet(user);
    const data = visitTypeSchema.parse(input);
    return this.db.write(async (tx) => {
      const types = await tx.visitType.findMany({ select: { id: true, name: true } });
      if (types.some((t) => t.id !== key && t.name.toLowerCase() === data.name.toLowerCase()))
        fail('A visit type with this name already exists');
      if (key) {
        required(await tx.visitType.findUnique({ where: { id: key } }));
        return tx.visitType.update({ where: { id: key }, data });
      }
      return tx.visitType.create({ data: { ...data, id: id(), retired: data.retired || false } });
    });
  }
  async deleteVisitType(user: User, key: string) {
    requireVet(user);
    return this.db.write(async (tx) => {
      required(await tx.visitType.findUnique({ where: { id: key } }));
      if (
        (await tx.appointmentPlan.count({ where: { visitTypeId: key } })) ||
        (await tx.appointmentAiDraft.count({ where: { visitTypeId: key } }))
      )
        fail('Used visit types can be retired but never deleted');
      await tx.visitType.delete({ where: { id: key } });
      return { ok: true };
    });
  }
  async timeBlock(user: User, input: unknown) {
    requireVet(user);
    const data = timeBlockSchema.parse(input);
    return this.db.write(async (tx) => {
      const start = Date.parse(data.startsAt);
      const end = Date.parse(data.endsAt);
      if (end <= this.now()) fail('Choose a future time block');
      const visits = await tx.appointment.findMany({
        where: {
          status: { not: 'Cancelled' },
          scheduledAt: {
            gte: new Date(start - MAX_VISIT_MINUTES * 60_000).toISOString(),
            lt: data.endsAt,
          },
        },
        select: { scheduledAt: true, plan: { select: { durationMinutes: true } } },
      });
      if (
        visits.some((a) =>
          overlaps(
            start,
            end,
            Date.parse(a.scheduledAt!),
            endOf(a.scheduledAt!, a.plan?.durationMinutes || 30),
          ),
        )
      )
        fail('A block cannot overlap an existing appointment');
      return toTimeBlock(await tx.timeBlock.create({ data: { ...data, id: id() } }));
    });
  }
  async deleteTimeBlock(user: User, key: string) {
    requireVet(user);
    return this.db.write(async (tx) => {
      required(await tx.timeBlock.findUnique({ where: { id: key } }));
      await tx.timeBlock.delete({ where: { id: key } });
      return { ok: true };
    });
  }
}
