import type { PlanInput, User } from '@vet-clinic/types';
import type { PlanningPort } from '../src/domain/ports/planning.port';

import type { EmailPort, ReportEmail } from '../src/domain/ports/email.port';

import { Clinic } from '../src/clinic';
import { Store } from '../src/infrastructure/sqlite/store';

export const DAY = '2030-01-07'; // Monday, winter offset in Havana.
export const TIME = '2030-01-07T14:00:00.000Z'; // 09:00 at the clinic.
export const CODE = 'test-clinic-access-code';
export const PASSWORD = 'correct-horse-battery';
export class FakePlanningAdapter implements PlanningPort {
  readonly available = true;
  plan: PlanInput = { visitTypeId: 'type-1', durationMinutes: 30, estimatedActives: [] };
  draft = async () => structuredClone(this.plan);
}
export class FakeEmailAdapter implements EmailPort {
  readonly available = true;
  messages: ReportEmail[] = [];
  async sendReport(message: ReportEmail) {
    this.messages.push(message);
  }
}
export function fixture(options: { path?: string; vets?: number } = {}) {
  process.env.CLINIC_ACCESS_CODE = CODE;
  const store = new Store(options.path || ':memory:');
  const clock = { value: Date.parse('2030-01-07T12:00:00Z') };
  const ai = new FakePlanningAdapter();
  const email = new FakeEmailAdapter();
  const clinic = new Clinic(store, ai, () => clock.value, 'America/Havana', email);
  const vets: User[] = [];
  for (let i = 0; i < (options.vets ?? 2); i++)
    vets.push(
      clinic.auth.register(
        { name: `Vet ${i}`, email: `vet${i}@example.com`, password: PASSWORD, clinicCode: CODE },
        true,
      ).user,
    );
  const owner = clinic.auth.register({
    name: 'Owner',
    email: 'owner@example.com',
    password: PASSWORD,
  }).user;
  const pet = clinic.pets.pet(owner, {
    name: 'Luna',
    species: 'Cat',
    sex: 'Female',
    approximateAge: '3 years',
  });
  const book = (scheduledAt = TIME) =>
    clinic.appointments.book(owner, { petId: pet.id, symptoms: 'Limping', scheduledAt });
  const appointment = (id: string) => store.read().appointments.find((a) => a.id === id)!;
  const plan = (
    id: string,
    estimatedActives: PlanInput['estimatedActives'] = [],
    durationMinutes = 30,
  ) =>
    clinic.appointments.appointment(vets[0], id, 'plan', {
      visitTypeId: 'type-1',
      durationMinutes,
      estimatedActives,
      revision: appointment(id).revision,
    });
  return { store, clock, ai, email, clinic, vets, owner, pet, book, appointment, plan };
}
