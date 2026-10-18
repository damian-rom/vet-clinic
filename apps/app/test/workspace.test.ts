import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import type { VetWorkspace } from '@vet-clinic/types';
import { Store } from '../src/infrastructure/prisma/repositories';
import { fixture, TIME } from './helpers';

const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60000).toISOString();
const DAY_MS = 86400000;

test('the vet workspace keeps open visits, case checkpoints and 30 days of closed visits; older ones page in', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const vet = f.vets[0];
  const done = await f.book();
  const cancelled = await f.book(addMinutes(TIME, 60));
  const open = await f.book(addMinutes(TIME, 2 * 24 * 60));
  const inCase = await f.book(addMinutes(TIME, 120));
  await f.clinic.appointments.appointment(f.owner, cancelled.id, 'cancel', {});
  for (const id of [done.id, inCase.id]) {
    await f.plan(id);
    await f.clinic.appointments.appointment(vet, id, 'assign', { vetId: vet.id });
  }
  f.clock.value = Date.parse(TIME) + 3 * 60 * 60000;
  for (const id of [done.id, inCase.id])
    await f.clinic.appointments.appointment(vet, id, 'complete', {
      actualActives: [],
      revision: (await f.appointment(id)).revision,
    });

  const recent = (await f.clinic.views.workspace(vet)) as VetWorkspace;
  assert.deepEqual(
    recent.appointments.map((a) => a.id).sort(),
    [done.id, cancelled.id, open.id, inCase.id].sort(),
  );

  f.clock.value += 40 * DAY_MS;
  await f.clinic.cases.createCase(vet, {
    petId: f.pet.id,
    name: 'Follow-up',
    appointmentIds: [inCase.id],
  });
  const later = (await f.clinic.views.workspace(vet)) as VetWorkspace;
  assert.equal(later.historySince, '2030-01-17T00:00:00.000Z');
  assert.deepEqual(later.appointments.map((a) => a.id).sort(), [open.id, inCase.id].sort());

  // One per page: the window and the pages together hold every visit exactly once.
  const first = await f.clinic.views.history(vet, { before: later.historySince, limit: '1' });
  assert.equal(first.appointments.length, 1);
  assert.ok(first.next);
  const second = await f.clinic.views.history(vet, {
    before: later.historySince,
    limit: '1',
    cursor: first.next,
  });
  assert.equal(second.next, null);
  assert.deepEqual(
    [...first.appointments, ...second.appointments].map((a) => a.id).sort(),
    [done.id, cancelled.id].sort(),
  );
  assert.equal(
    (await f.clinic.views.history(vet, { before: later.historySince, petId: 'other-pet' }))
      .appointments.length,
    0,
  );
  await assert.rejects(
    () => f.clinic.views.history(f.owner, { before: later.historySince }),
    (e) => e instanceof HttpException && e.getStatus() === 403,
  );
});

test('planning metrics count the whole history in the database', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const [vet, other] = f.vets;
  const p = await f.clinic.inventory.createProduct(vet, { name: 'Vaccine', unit: 'dose' });
  const q = await f.clinic.inventory.createProduct(vet, { name: 'Swab', unit: 'unit' });
  const drafted = [
    { productId: p.id, quantity: 1 },
    { productId: q.id, quantity: 1 },
  ];
  f.ai.plan = { visitTypeId: 'type-1', durationMinutes: 30, estimatedActives: drafted };
  const kept = await f.book();
  const reordered = await f.book(addMinutes(TIME, 60));
  const longer = await f.book(addMinutes(TIME, 120));
  const late = await f.book(addMinutes(TIME, 30));
  await f.clinic.planning.draft(vet, { appointmentIds: [kept.id, reordered.id, longer.id] });
  await f.plan(kept.id, drafted);
  await f.plan(reordered.id, [...drafted].reverse());
  await f.plan(longer.id, drafted, 50);

  await f.clinic.appointments.appointment(vet, kept.id, 'assign', { vetId: vet.id });
  await f.clinic.appointments.appointment(other, late.id, 'assign', { vetId: other.id });
  f.clock.value = Date.parse(TIME) + 60 * 60000;
  // Planned only after the visit started.
  await f.plan(late.id);
  for (const id of [kept.id, late.id])
    await f.clinic.appointments.appointment(vet, id, 'complete', {
      actualActives: [],
      revision: (await f.appointment(id)).revision,
    });

  const { metrics } = (await f.clinic.views.workspace(vet)) as VetWorkspace;
  assert.deepEqual(metrics, {
    completedVisits: 2,
    plannedBeforeVisitPercent: 50,
    aiKeptWithMinorEditsPercent: 33,
  });
});

test('a vet workspace with more than a thousand planned visits loads with product order intact', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const vet = f.vets[0];
  const p = await f.clinic.inventory.createProduct(vet, { name: 'Vaccine', unit: 'dose' });
  const q = await f.clinic.inventory.createProduct(vet, { name: 'Swab', unit: 'unit' });
  const estimatedActives = [
    { productId: q.id, quantity: 2 },
    { productId: p.id, quantity: 1 },
  ];
  await new Store(f.db).write(async (repos) => {
    for (let i = 0; i < 1100; i++)
      await repos.appointments.create({
        id: `bulk-${String(i).padStart(4, '0')}`,
        petId: f.pet.id,
        ownerId: f.owner.id,
        symptoms: 'Recheck',
        status: 'NeedsTime',
        createdAt: new Date(f.clock.value).toISOString(),
        revision: 0,
        plan: {
          visitTypeId: 'type-1',
          durationMinutes: 30,
          estimatedActives,
          source: 'human',
          reviewedBy: vet.id,
          savedAt: new Date(f.clock.value).toISOString(),
        },
      });
  });
  const workspace = (await f.clinic.views.workspace(vet)) as VetWorkspace;
  assert.equal(workspace.appointments.length, 1100);
  assert.ok(workspace.appointments.every((a) => a.plan?.estimatedActives[0].productId === q.id));
  assert.equal(workspace.products.find((x) => x.id === p.id)!.needed, 1100);
});
