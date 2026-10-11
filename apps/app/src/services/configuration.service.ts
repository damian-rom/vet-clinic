import type { User } from '@vet-clinic/types';
import { timeBlockSchema, visitTypeSchema } from '@vet-clinic/validation';
import { Store } from '../infrastructure/sqlite/store';
import { endOf, overlaps } from '../time';
import { fail, id, duration, requireVet, find } from '../domain/rules';
export class ConfigurationService {
  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}
  visitType(user: User, input: unknown, key?: string) {
    requireVet(user);
    const data = visitTypeSchema.parse(input);
    return this.store.transaction((s) => {
      if (
        s.visitTypes.some((t) => t.id !== key && t.name.toLowerCase() === data.name.toLowerCase())
      )
        fail('A visit type with this name already exists');
      if (key) {
        const t = find(s.visitTypes, key);
        Object.assign(t, data);
        return t;
      }
      const t = { ...data, id: id(), retired: data.retired || false };
      s.visitTypes.push(t);
      return t;
    });
  }
  deleteVisitType(user: User, key: string) {
    requireVet(user);
    return this.store.transaction((s) => {
      find(s.visitTypes, key);
      if (
        s.appointments.some(
          (a) => a.plan?.visitTypeId === key || a.plan?.originalDraft?.visitTypeId === key,
        )
      )
        fail('Used visit types can be retired but never deleted');
      s.visitTypes = s.visitTypes.filter((t) => t.id !== key);
      return { ok: true };
    });
  }
  timeBlock(user: User, input: unknown) {
    requireVet(user);
    const data = timeBlockSchema.parse(input);
    return this.store.transaction((s) => {
      const start = Date.parse(data.startsAt);
      const end = Date.parse(data.endsAt);
      if (end <= this.now()) fail('Choose a future time block');
      if (
        s.appointments.some(
          (a) =>
            a.status !== 'Cancelled' &&
            a.scheduledAt &&
            overlaps(start, end, Date.parse(a.scheduledAt), endOf(a.scheduledAt, duration(a))),
        )
      )
        fail('A block cannot overlap an existing appointment');
      const b = { ...data, id: id() };
      s.timeBlocks.push(b);
      return b;
    });
  }
  deleteTimeBlock(user: User, key: string) {
    requireVet(user);
    return this.store.transaction((s) => {
      find(s.timeBlocks, key);
      s.timeBlocks = s.timeBlocks.filter((b) => b.id !== key);
      return { ok: true };
    });
  }
}
