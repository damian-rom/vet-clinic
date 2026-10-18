import { createServer } from '../src/server';
import { Store } from '../src/infrastructure/prisma/repositories';
import { fixture } from './helpers';

async function main() {
  const f = await fixture();
  f.clock.value = Date.now();
  const product = await f.clinic.inventory.createProduct(f.vets[0], {
    name: 'Vaccine',
    unit: 'dose',
  });
  await f.clinic.inventory.movement(f.vets[0], {
    productId: product.id,
    type: 'Received',
    quantity: 10,
  });
  // An isolated in-memory past visit exercises completion through the UI.
  await new Store(f.db).write((repos) =>
    repos.appointments.create({
      id: 'ready-to-complete',
      ownerId: f.owner.id,
      petId: f.pet.id,
      vetId: f.vets[0].id,
      scheduledAt: '2026-01-05T14:00:00.000Z',
      symptoms: 'Annual vaccination',
      status: 'Confirmed',
      createdAt: '2026-01-01T12:00:00.000Z',
      revision: 0,
      plan: {
        visitTypeId: 'type-4',
        durationMinutes: 30,
        estimatedActives: [{ productId: product.id, quantity: 1 }],
        source: 'human',
        reviewedBy: f.vets[0].id,
        savedAt: '2026-01-02T12:00:00.000Z',
      },
    }),
  );
  const app = await createServer(f.clinic);
  await app.listen(3101, '127.0.0.1');
  console.log('Isolated browser-test clinic ready on port 3101');
}
void main();
