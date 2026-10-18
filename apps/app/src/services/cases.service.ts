import { attachCheckpointSchema } from '@vet-clinic/validation';
import type { Appointment, User } from '@vet-clinic/types';
import { caseSchema, checkpointSchema } from '@vet-clinic/validation';
import { fail, id, requireVet, isoNow } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';
import { AppointmentsService } from './appointments.service';
export class CasesService {
  constructor(
    private readonly store: Store,
    private readonly appointments: AppointmentsService,
    private readonly now: () => number,
  ) {}
  async createCase(user: User, input: unknown) {
    requireVet(user);
    const data = caseSchema.parse(input);
    return this.store.write(async (repos) => {
      await repos.pets.get(data.petId);
      if (new Set(data.appointmentIds).size !== data.appointmentIds.length)
        fail('Checkpoints cannot be repeated', 400);
      const appointments = await repos.appointments.findMany(data.appointmentIds);
      if (appointments.length !== data.appointmentIds.length) fail('Record not found', 404);
      if (appointments.some((a) => a.petId !== data.petId || a.caseId || a.status === 'Cancelled'))
        fail("Choose this pet's appointments that are not already in a case or cancelled");
      const careCase = await repos.cases.create({
        petId: data.petId,
        name: data.name,
        createdAt: isoNow(this.now),
      });
      for (const [index, appointmentId] of data.appointmentIds.entries())
        await repos.appointments.attachToCase(appointmentId, careCase.id, index + 1);
      return { ...careCase, checkpointIds: data.appointmentIds };
    });
  }
  async checkpoint(user: User, caseId: string, input: unknown) {
    requireVet(user);
    const data = checkpointSchema.parse(input);
    return this.store.write(async (repos) => {
      const c = await repos.cases.get(caseId);
      const pet = await repos.pets.get(c.petId);
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
      if (!data.petNeeded) await this.appointments.reserve(repos, a);
      await repos.appointments.create(a);
      return { id: a.id };
    });
  }
  async attachCheckpoint(user: User, caseId: string, input: unknown) {
    requireVet(user);
    const { appointmentId } = attachCheckpointSchema.parse(input);
    return this.store.write(async (repos) => {
      const c = await repos.cases.get(caseId);
      const a = await repos.appointments.get(appointmentId);
      if (a.petId !== c.petId || a.caseId || a.status === 'Cancelled')
        fail('This appointment cannot be added to this case');
      await repos.appointments.attachToCase(a.id, c.id, c.checkpointIds.length + 1);
      return { ...c, checkpointIds: [...c.checkpointIds, a.id] };
    });
  }
}
