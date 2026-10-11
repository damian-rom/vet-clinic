import type { User } from '@vet-clinic/types';
import { registerPetSchema } from '@vet-clinic/validation';
import { Store } from '../infrastructure/sqlite/store';
import { fail, id, requireOwner, find } from '../domain/rules';
export class PetsService {
  constructor(private readonly store: Store) {}
  pet(user: User, input: unknown, petId?: string) {
    requireOwner(user);
    const data = registerPetSchema.parse(input);
    return this.store.transaction((s) => {
      if (petId) {
        const pet = find(s.pets, petId);
        if (pet.ownerId !== user.id) fail('Record not found', 404);
        Object.assign(pet, data);
        // Optional fields omitted by the edit form are cleared.
        for (const k of ['dateOfBirth', 'approximateAge', 'breed', 'weight', 'notes'] as const)
          if (!(k in data)) delete pet[k];
        return pet;
      }
      const pet = { ...data, id: id(), ownerId: user.id };
      s.pets.push(pet);
      return pet;
    });
  }
  deletePet(user: User, petId: string) {
    requireOwner(user);
    return this.store.transaction((s) => {
      const pet = find(s.pets, petId);
      if (pet.ownerId !== user.id) fail('Record not found', 404);
      if (s.appointments.some((a) => a.petId === petId) || s.cases.some((c) => c.petId === petId))
        fail('Pets with care history cannot be deleted');
      s.pets = s.pets.filter((p) => p.id !== petId);
      return { ok: true };
    });
  }
}
