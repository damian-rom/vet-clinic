import type { Pet } from '@vet-clinic/types';
import type { registerPetSchema } from '@vet-clinic/validation';
import type { z } from 'zod';
import { id } from '../../../domain/rules';
import { toPet } from '../records';
import { BaseRepository } from './base.repository';

type PetFields = z.infer<typeof registerPetSchema>;
const byName = [{ name: 'asc' }, { id: 'asc' }] as const;

export class PetsRepository extends BaseRepository<Pet> {
  async find(petId: string) {
    const row = await this.tx.pet.findUnique({ where: { id: petId } });
    return row && toPet(row);
  }
  async list(): Promise<Pet[]> {
    return (await this.tx.pet.findMany({ orderBy: [...byName] })).map(toPet);
  }
  async listByOwner(ownerId: string): Promise<Pet[]> {
    return (await this.tx.pet.findMany({ where: { ownerId }, orderBy: [...byName] })).map(toPet);
  }
  async create(ownerId: string, fields: PetFields): Promise<Pet> {
    return toPet(await this.tx.pet.create({ data: { ...fields, id: id(), ownerId } }));
  }
  /** Replaces every editable field; optional ones the form leaves out are cleared. */
  async replace(petId: string, fields: PetFields): Promise<Pet> {
    const cleared = {
      dateOfBirth: null,
      approximateAge: null,
      breed: null,
      weight: null,
      notes: null,
    };
    return toPet(
      await this.tx.pet.update({ where: { id: petId }, data: { ...cleared, ...fields } }),
    );
  }
  async hasCareHistory(petId: string) {
    return (
      (await this.tx.appointment.count({ where: { petId } })) > 0 ||
      (await this.tx.case.count({ where: { petId } })) > 0
    );
  }
  async delete(petId: string) {
    await this.tx.pet.delete({ where: { id: petId } });
  }
}
