import type { Database } from '@vet-clinic/db';
import type { User } from '@vet-clinic/types';
import { registerPetSchema } from '@vet-clinic/validation';
import { fail, id, requireOwner, required } from '../domain/rules';
import { toPet } from '../infrastructure/prisma/records';
export class PetsService {
  constructor(private readonly db: Database) {}
  async pet(user: User, input: unknown, petId?: string) {
    requireOwner(user);
    const data = registerPetSchema.parse(input);
    return this.db.write(async (tx) => {
      if (petId) {
        const pet = required(await tx.pet.findUnique({ where: { id: petId } }));
        if (pet.ownerId !== user.id) fail('Record not found', 404);
        // Optional fields omitted by the edit form are cleared.
        const cleared = {
          dateOfBirth: null,
          approximateAge: null,
          breed: null,
          weight: null,
          notes: null,
        };
        return toPet(await tx.pet.update({ where: { id: petId }, data: { ...cleared, ...data } }));
      }
      return toPet(await tx.pet.create({ data: { ...data, id: id(), ownerId: user.id } }));
    });
  }
  async deletePet(user: User, petId: string) {
    requireOwner(user);
    return this.db.write(async (tx) => {
      const pet = required(await tx.pet.findUnique({ where: { id: petId } }));
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      if (
        (await tx.appointment.count({ where: { petId } })) ||
        (await tx.case.count({ where: { petId } }))
      )
        fail('Pets with care history cannot be deleted');
      await tx.pet.delete({ where: { id: petId } });
      return { ok: true };
    });
  }
}
