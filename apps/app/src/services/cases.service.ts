import { attachCheckpointSchema } from '@vet-clinic/validation';
import type { Database } from '@vet-clinic/db';
import type { Appointment, User } from '@vet-clinic/types';
import { caseSchema, checkpointSchema } from '@vet-clinic/validation';
import { fail, id, requireVet, required, isoNow } from '../domain/rules';
import { caseInclude, createAppointment, toCase } from '../infrastructure/prisma/records';
import { AppointmentsService } from './appointments.service';
export class CasesService {
  constructor(
    private readonly db: Database,
    private readonly appointments: AppointmentsService,
    private readonly now: () => number,
  ) {}
  async createCase(user: User, input: unknown) {
    requireVet(user);
    const data = caseSchema.parse(input);
    return this.db.write(async (tx) => {
      required(await tx.pet.findUnique({ where: { id: data.petId } }));
      if (new Set(data.appointmentIds).size !== data.appointmentIds.length)
        fail('Checkpoints cannot be repeated', 400);
      const appointments = await tx.appointment.findMany({
        where: { id: { in: data.appointmentIds } },
      });
      if (appointments.length !== data.appointmentIds.length) fail('Record not found', 404);
      if (appointments.some((a) => a.petId !== data.petId || a.caseId || a.status === 'Cancelled'))
        fail("Choose this pet's appointments that are not already in a case or cancelled");
      const careCase = await tx.case.create({
        data: { id: id(), petId: data.petId, name: data.name, createdAt: isoNow(this.now) },
      });
      for (const [index, appointmentId] of data.appointmentIds.entries())
        await tx.appointment.update({
          where: { id: appointmentId },
          data: {
            caseId: careCase.id,
            checkpointOrder: index + 1,
            petNeeded: true,
            revision: { increment: 1 },
          },
        });
      return { ...careCase, checkpointIds: data.appointmentIds };
    });
  }
  async checkpoint(user: User, caseId: string, input: unknown) {
    requireVet(user);
    const data = checkpointSchema.parse(input);
    return this.db.write(async (tx) => {
      const c = toCase(
        required(await tx.case.findUnique({ where: { id: caseId }, include: caseInclude })),
      );
      const pet = required(await tx.pet.findUnique({ where: { id: c.petId } }));
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
      if (!data.petNeeded) await this.appointments.reserve(tx, a);
      await createAppointment(tx, a);
      return { id: a.id };
    });
  }
  async attachCheckpoint(user: User, caseId: string, input: unknown) {
    requireVet(user);
    const { appointmentId } = attachCheckpointSchema.parse(input);
    return this.db.write(async (tx) => {
      const c = toCase(
        required(await tx.case.findUnique({ where: { id: caseId }, include: caseInclude })),
      );
      const a = required(await tx.appointment.findUnique({ where: { id: appointmentId } }));
      if (a.petId !== c.petId || a.caseId || a.status === 'Cancelled')
        fail('This appointment cannot be added to this case');
      await tx.appointment.update({
        where: { id: a.id },
        data: {
          caseId: c.id,
          checkpointOrder: c.checkpointIds.length + 1,
          petNeeded: true,
          revision: { increment: 1 },
        },
      });
      return { ...c, checkpointIds: [...c.checkpointIds, a.id] };
    });
  }
}
