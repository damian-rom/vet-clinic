import { attachCheckpointSchema } from '@vet-clinic/validation';
import type { Appointment, User } from '@vet-clinic/types';
import { caseSchema, checkpointSchema } from '@vet-clinic/validation';
import { Store } from '../infrastructure/sqlite/store';
import { fail, id, requireVet, find, isoNow } from '../domain/rules';
import { AppointmentsService } from './appointments.service';
export class CasesService {
  constructor(
    private readonly store: Store,
    private readonly appointments: AppointmentsService,
    private readonly now: () => number,
  ) {}
  createCase(user: User, input: unknown) {
    requireVet(user);
    const data = caseSchema.parse(input);
    return this.store.transaction((s) => {
      find(s.pets, data.petId);
      if (new Set(data.appointmentIds).size !== data.appointmentIds.length)
        fail('Checkpoints cannot be repeated', 400);
      const appointments = data.appointmentIds.map((key) => find(s.appointments, key));
      if (appointments.some((a) => a.petId !== data.petId || a.caseId || a.status === 'Cancelled'))
        fail("Choose this pet's appointments that are not already in a case or cancelled");
      const c = {
        id: id(),
        petId: data.petId,
        name: data.name,
        checkpointIds: data.appointmentIds,
        createdAt: isoNow(this.now),
      };
      appointments.forEach((a, i) => {
        a.caseId = c.id;
        a.checkpointOrder = i + 1;
        a.petNeeded = true;
        a.revision++;
      });
      s.cases.push(c);
      return c;
    });
  }
  checkpoint(user: User, caseId: string, input: unknown) {
    requireVet(user);
    const data = checkpointSchema.parse(input);
    return this.store.transaction((s) => {
      const c = find(s.cases, caseId);
      const pet = find(s.pets, c.petId);
      const a: Appointment = {
        id: id(),
        petId: pet.id,
        ownerId: pet.ownerId,
        symptoms: data.symptoms,
        caseId: c.id,
        checkpointOrder: c.checkpointIds.length + 1,
        petNeeded: data.petNeeded,
        status: data.petNeeded ? 'NeedsTime' : 'Confirmed',
        createdAt: isoNow(this.now),
        revision: 0,
        ...(!data.petNeeded ? { scheduledAt: data.scheduledAt, vetId: data.vetId } : {}),
      };
      if (!data.petNeeded) this.appointments.reserve(s, a);
      c.checkpointIds.push(a.id);
      s.appointments.push(a);
      return { id: a.id };
    });
  }
  attachCheckpoint(user: User, caseId: string, input: unknown) {
    requireVet(user);
    const { appointmentId } = attachCheckpointSchema.parse(input);
    return this.store.transaction((s) => {
      const c = find(s.cases, caseId);
      const a = find(s.appointments, appointmentId);
      if (a.petId !== c.petId || a.caseId || a.status === 'Cancelled')
        fail('This appointment cannot be added to this case');
      a.caseId = c.id;
      a.checkpointOrder = c.checkpointIds.length + 1;
      a.petNeeded = true;
      a.revision++;
      c.checkpointIds.push(a.id);
      return c;
    });
  }
}
