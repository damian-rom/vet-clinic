import type { User } from '@vet-clinic/types';
import { registerPetSchema } from '@vet-clinic/validation';
import { fail, requireOwner } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';
export class PetsService {
  constructor(private readonly store: Store) {}
  async pet(user: User, input: unknown, petId?: string) {
    requireOwner(user);
    const data = registerPetSchema.parse(input);
    return this.store.write(async (repos) => {
      if (!petId) return repos.pets.create(user.id, data);
      const pet = await repos.pets.get(petId);
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      return repos.pets.replace(petId, data);
    });
  }
  async deletePet(user: User, petId: string) {
    requireOwner(user);
    return this.store.write(async (repos) => {
      const pet = await repos.pets.get(petId);
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      if (await repos.pets.hasCareHistory(petId)) fail('Pets with care history cannot be deleted');
      await repos.pets.delete(petId);
      return { ok: true };
    });
  }
}
