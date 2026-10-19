import type { User } from '@vet-clinic/types';
import { timeBlockSchema, visitTypeSchema, weeklyTimeBlockSchema } from '@vet-clinic/validation';
import { endOf, overlaps, weeklyOccurrences } from '../time';
import { fail, requireVet } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';
export class ConfigurationService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
    private readonly timezone: string,
  ) {}
  async visitType(user: User, input: unknown, key?: string) {
    requireVet(user);
    const data = visitTypeSchema.parse(input);
    return this.store.write(async (repos) => {
      if (await repos.visitTypes.nameTaken(data.name, key))
        fail('A visit type with this name already exists');
      if (key) {
        await repos.visitTypes.get(key);
        return repos.visitTypes.update(key, data);
      }
      return repos.visitTypes.create({
        name: data.name,
        retired: data.retired || false,
        materialsOptional: data.materialsOptional || false,
      });
    });
  }
  async deleteVisitType(user: User, key: string) {
    requireVet(user);
    return this.store.write(async (repos) => {
      await repos.visitTypes.get(key);
      if (await repos.visitTypes.inUse(key))
        fail('Used visit types can be retired but never deleted');
      await repos.visitTypes.delete(key);
      return { ok: true };
    });
  }
  async timeBlock(user: User, input: unknown) {
    requireVet(user);
    const data = timeBlockSchema.parse(input);
    return this.store.write(async (repos) => {
      const start = Date.parse(data.startsAt);
      const end = Date.parse(data.endsAt);
      if (end <= this.now()) fail('Choose a future time block');
      const visits = await repos.appointments.scheduledNear(start, end, [
        'AwaitingConfirmation',
        'Confirmed',
        'NeedsTime',
        'Done',
      ]);
      if (
        visits.some((a) =>
          overlaps(start, end, Date.parse(a.scheduledAt), endOf(a.scheduledAt, a.durationMinutes)),
        )
      )
        fail('A block cannot overlap an existing appointment');
      return repos.timeBlocks.create(data);
    });
  }
  async weeklyTimeBlock(user: User, input: unknown) {
    requireVet(user);
    const data = weeklyTimeBlockSchema.parse(input);
    return this.store.write(async (repos) => {
      const visits = await repos.appointments.scheduledNear(this.now(), undefined, [
        'AwaitingConfirmation',
        'Confirmed',
      ]);
      if (
        visits.some(
          (a) =>
            weeklyOccurrences(
              [data],
              Date.parse(a.scheduledAt),
              endOf(a.scheduledAt, a.durationMinutes),
              this.timezone,
            ).length,
        )
      )
        fail('A weekly block cannot overlap an upcoming appointment');
      return repos.weeklyTimeBlocks.create(data);
    });
  }
  async deleteWeeklyTimeBlock(user: User, key: string) {
    requireVet(user);
    return this.store.write(async (repos) => {
      await repos.weeklyTimeBlocks.get(key);
      await repos.weeklyTimeBlocks.delete(key);
      return { ok: true };
    });
  }
  async deleteTimeBlock(user: User, key: string) {
    requireVet(user);
    return this.store.write(async (repos) => {
      await repos.timeBlocks.get(key);
      await repos.timeBlocks.delete(key);
      return { ok: true };
    });
  }
}
