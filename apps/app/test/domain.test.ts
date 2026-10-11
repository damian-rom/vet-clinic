import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { HttpException } from '@nestjs/common';
import { Clinic } from '../src/clinic';
import { Store } from '../src/infrastructure/sqlite/store';
import { clinicInstant, localParts } from '../src/time';
import { fixture, DAY, PASSWORD, TIME } from './helpers';

function denied(fn: () => unknown, status = 409) {
  assert.throws(fn, (e) => e instanceof HttpException && e.getStatus() === status);
}
const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60000).toISOString();

test('BR-1: personal accounts, clinic code only at signup, hashed passwords and sessions', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  denied(
    () =>
      f.clinic.auth.register(
        { name: 'Bad vet', email: 'bad@example.com', password: PASSWORD, clinicCode: 'wrong' },
        true,
      ),
    403,
  );
  const login = f.clinic.auth.login({ email: 'VET0@example.com', password: PASSWORD });
  assert.equal(login.user.id, f.vets[0].id);
  assert.equal(login.user.role, 'vet');
  assert.ok(!JSON.stringify(login.user).includes('password'));
  assert.ok(!JSON.stringify(f.store.read()).includes(login.token));
  assert.ok(!JSON.stringify(f.store.read()).includes(PASSWORD));
  assert.equal(f.clinic.auth.authenticate(login.token).id, login.user.id);
  f.clinic.auth.logout(login.token);
  denied(() => f.clinic.auth.authenticate(login.token), 401);
  const again = f.clinic.auth.login({ email: 'owner@example.com', password: PASSWORD });
  f.clock.value += 8 * 86400000;
  denied(() => f.clinic.auth.authenticate(again.token), 401);
});

test('BR-2: owners receive only their own records and no planning, stock, calendars or AI fields', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  f.plan(a.id);
  const other = f.clinic.auth.register({
    name: 'Other',
    email: 'other@example.com',
    password: PASSWORD,
  }).user;
  const snapshot = f.clinic.views.workspace(f.owner);
  assert.equal(snapshot.appointments.length, 1);
  for (const key of ['plan', 'actualActives', 'revision'])
    assert.ok(!(key in snapshot.appointments[0]));
  for (const key of ['timeBlocks', 'products', 'movements', 'owners', 'aiAvailable'])
    assert.ok(!(key in snapshot));
  assert.equal(f.clinic.views.workspace(other).pets.length, 0);
  denied(() => f.clinic.appointments.appointment(other, a.id, 'cancel', {}), 404);
  denied(() => f.clinic.inventory.createProduct(f.owner, { name: 'x', unit: 'ml' }), 403);
  denied(() => f.clinic.configuration.timeBlock(f.owner, {}), 403);
});

test('pet validation, editing, ownership, and safe deletion of pets without history', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  assert.throws(() => f.clinic.pets.pet(f.owner, { name: 'No age', species: 'Dog', sex: 'Male' }));
  assert.throws(() =>
    f.clinic.pets.pet(f.owner, {
      name: 'Bad birthday',
      species: 'Dog',
      sex: 'Male',
      dateOfBirth: '2025-02-30',
    }),
  );
  f.clinic.pets.pet(
    f.owner,
    { name: 'Luna II', species: 'Cat', sex: 'Female', dateOfBirth: '2020-01-01' },
    f.pet.id,
  );
  assert.equal(f.store.read().pets[0].name, 'Luna II');
  assert.equal(f.store.read().pets[0].approximateAge, undefined);
  f.clinic.pets.deletePet(f.owner, f.pet.id);
  assert.equal(f.store.read().pets.length, 0);
});

test('BR-3: no capacity without veterinarians; fixed opening hours and future slots', (t) => {
  const f = fixture({ vets: 0 });
  t.after(() => f.store.close());
  assert.deepEqual(f.clinic.appointments.slots(f.owner, DAY).slots, []);
  denied(() => f.book());
  const g = fixture();
  t.after(() => g.store.close());
  assert.equal(g.clinic.appointments.slots(g.owner, DAY).slots.length, 18);
  assert.equal(g.clinic.appointments.slots(g.owner, '2030-01-12').slots.length, 0);
  denied(() => g.book('2030-01-07T13:00:00Z'));
  denied(() => g.book('2030-01-07T14:15:00Z'));
  denied(() => g.book('2030-01-07T23:00:00Z'));
  denied(() => g.book('2020-01-01T14:00:00Z'));
});

test('BR-3: pending reservations count; cancellation immediately releases capacity and preserves history', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const b = f.book();
  denied(() => f.book());
  assert.ok(!f.clinic.appointments.slots(f.owner, DAY).slots.includes(TIME));
  f.clinic.appointments.appointment(f.owner, a.id, 'cancel', {});
  assert.ok(f.clinic.appointments.slots(f.owner, DAY).slots.includes(TIME));
  assert.equal(f.appointment(a.id).status, 'Cancelled');
  assert.equal(f.appointment(b.id).status, 'AwaitingConfirmation');
  denied(() => f.clinic.pets.deletePet(f.owner, f.pet.id));
});

test('BR-4/5/6: humans assign; same-vet collisions rejected, separate vets can share times', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const b = f.book();
  assert.equal(f.appointment(a.id).vetId, undefined);
  f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
  denied(() =>
    f.clinic.appointments.appointment(f.vets[0], b.id, 'assign', { vetId: f.vets[0].id }),
  );
  f.clinic.appointments.appointment(f.vets[0], b.id, 'assign', { vetId: f.vets[1].id });
  assert.equal(f.appointment(b.id).status, 'Confirmed');
});

test('full-duration capacity, duration changes, and rescheduling share one collision rule', (t) => {
  const f = fixture({ vets: 1 });
  t.after(() => f.store.close());
  const a = f.book();
  f.plan(a.id, [], 60);
  assert.ok(!f.clinic.appointments.slots(f.owner, DAY).slots.includes(addMinutes(TIME, 30)));
  denied(() => f.book(addMinutes(TIME, 30)));
  const b = f.book(addMinutes(TIME, 60));
  f.plan(b.id);
  f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
  f.clinic.appointments.appointment(f.vets[0], b.id, 'assign', { vetId: f.vets[0].id });
  denied(() => f.plan(a.id, [], 90));
  assert.equal(f.appointment(a.id).plan?.durationMinutes, 60);
  denied(() =>
    f.clinic.appointments.appointment(f.vets[0], b.id, 'reschedule', {
      scheduledAt: addMinutes(TIME, 30),
      revision: f.appointment(b.id).revision,
    }),
  );
  assert.equal(f.appointment(b.id).scheduledAt, addMinutes(TIME, 60));
  f.clinic.appointments.appointment(f.vets[0], b.id, 'reschedule', {
    scheduledAt: addMinutes(TIME, 120),
    revision: f.appointment(b.id).revision,
  });
  denied(() =>
    f.clinic.appointments.appointment(f.vets[0], b.id, 'reschedule', {
      scheduledAt: addMinutes(TIME, 150),
      revision: 0,
    }),
  );
});

test('BR-7: time blocks refuse pending and long appointments, then hide open slots', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  f.plan(a.id, [], 90);
  denied(() =>
    f.clinic.configuration.timeBlock(f.vets[0], {
      startsAt: addMinutes(TIME, 60),
      endsAt: addMinutes(TIME, 120),
    }),
  );
  f.clinic.appointments.appointment(f.vets[0], a.id, 'request-time', {});
  const block = f.clinic.configuration.timeBlock(f.vets[0], {
    startsAt: TIME,
    endsAt: addMinutes(TIME, 60),
    reason: 'Lunch',
  });
  assert.ok(!f.clinic.appointments.slots(f.owner, DAY).slots.includes(TIME));
  denied(() =>
    f.clinic.appointments.appointment(f.owner, a.id, 'pick-time', { scheduledAt: TIME }),
  );
  f.clinic.configuration.deleteTimeBlock(f.vets[0], block.id);
  f.clinic.appointments.appointment(f.owner, a.id, 'pick-time', { scheduledAt: TIME });
  assert.equal(f.appointment(a.id).status, 'AwaitingConfirmation');
  assert.equal(f.appointment(a.id).vetId, undefined);
});

test('BR-8/9: AI never confirms, keeps original draft, marks review and skips human work', async (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const b = f.book(addMinutes(TIME, 60));
  f.plan(b.id);
  const first = await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id, b.id] });
  assert.deepEqual(
    first.results.map((r) => r.outcome),
    ['drafted', 'skipped'],
  );
  assert.equal(f.appointment(a.id).status, 'AwaitingConfirmation');
  assert.equal(f.appointment(a.id).vetId, undefined);
  assert.equal(f.appointment(a.id).plan?.source, 'ai-draft');
  f.plan(a.id, [], 45);
  const reviewed = f.appointment(a.id).plan!;
  assert.equal(reviewed.source, 'ai-reviewed');
  assert.equal(reviewed.reviewedBy, f.vets[0].id);
  assert.equal(reviewed.originalDraft?.durationMinutes, 30);
  assert.equal(
    (await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] })).results[0].outcome,
    'skipped',
  );
  await assert.rejects(() => f.clinic.planning.draft(f.owner, { appointmentIds: [a.id] }));
});

test('AI rechecks human changes while its provider is running', async (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  let release: (value: typeof f.ai.plan) => void = () => {};
  f.ai.draft = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] });
  f.plan(a.id, [], 60);
  release(f.ai.plan);
  assert.equal((await pending).results[0].outcome, 'skipped');
  assert.equal(f.appointment(a.id).plan?.durationMinutes, 60);
});

test('AI validates unknown IDs and collisions without partially saving a draft', async (t) => {
  const f = fixture({ vets: 1 });
  t.after(() => f.store.close());
  const a = f.book();
  const b = f.book(addMinutes(TIME, 30));
  f.ai.plan.durationMinutes = 60;
  assert.equal(
    (await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] })).results[0].outcome,
    'failed',
  );
  assert.equal(f.appointment(a.id).plan, undefined);
  f.ai.plan = { visitTypeId: 'missing', durationMinutes: 30, estimatedActives: [] };
  assert.equal(
    (await f.clinic.planning.draft(f.vets[0], { appointmentIds: [b.id] })).results[0].outcome,
    'failed',
  );
});

test('BR-10/11/12: forecasting warns without changing stock; completion is atomic and never negative', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const p = f.clinic.inventory.createProduct(f.vets[0], { name: 'Vaccine', unit: 'dose' });
  const q = f.clinic.inventory.createProduct(f.vets[0], { name: 'Suture', unit: 'kit' });
  f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Received', quantity: 1 });
  f.plan(a.id, [
    { productId: p.id, quantity: 2 },
    { productId: q.id, quantity: 1 },
  ]);
  assert.equal(f.store.read().products[0].stock, 1);
  assert.equal(f.store.read().movements.length, 1);
  f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
  denied(() =>
    f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', {
      actualActives: [],
      revision: f.appointment(a.id).revision,
    }),
  );
  f.clock.value = Date.parse(TIME) + 60000;
  denied(() =>
    f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', {
      actualActives: [
        { productId: p.id, quantity: 1 },
        { productId: q.id, quantity: 1 },
      ],
      revision: f.appointment(a.id).revision,
    }),
  );
  assert.equal(f.store.read().products[0].stock, 1);
  assert.equal(f.store.read().movements.length, 1);
  assert.equal(f.appointment(a.id).status, 'Confirmed');
  assert.throws(() =>
    f.clinic.inventory.movement(f.vets[0], { productId: q.id, type: 'Correction', quantity: 1 }),
  );
  f.clinic.inventory.movement(f.vets[0], {
    productId: q.id,
    type: 'Correction',
    quantity: 1,
    reason: 'Shelf count',
  });
  const data = {
    actualActives: [
      { productId: p.id, quantity: 1 },
      { productId: q.id, quantity: 1 },
    ],
    revision: f.appointment(a.id).revision,
  };
  f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', data);
  assert.equal(f.appointment(a.id).status, 'Done');
  assert.ok(f.store.read().products.every((p) => p.stock === 0));
  assert.equal(
    f.store.read().movements.filter((m) => m.type === 'Used' && m.appointmentId === a.id).length,
    2,
  );
  assert.ok(f.store.read().movements.every((m) => m.performedBy === f.vets[0].id && m.performedAt));
  denied(() => f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', data));
});

test('inventory demand includes planned checkpoints still waiting for an owner time', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const product = f.clinic.inventory.createProduct(f.vets[0], { name: 'Lab kit', unit: 'kit' });
  const careCase = f.clinic.cases.createCase(f.vets[0], { petId: f.pet.id, name: 'Lab follow-up' });
  const checkpoint = f.clinic.cases.checkpoint(f.vets[0], careCase.id, {
    symptoms: 'Recheck',
    petNeeded: true,
  });
  f.plan(checkpoint.id, [{ productId: product.id, quantity: 2 }]);
  const workspace = f.clinic.views.workspace(f.vets[0]);
  assert.ok('products' in workspace);
  assert.equal(workspace.products[0].needed, 2);
  assert.equal(workspace.products[0].stock, 0);
});

test('stock validation forbids negative balances, duplicate usage, manual Used and negative deliveries', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const p = f.clinic.inventory.createProduct(f.vets[0], { name: 'Dose', unit: 'dose' });
  denied(() =>
    f.clinic.inventory.movement(f.vets[0], {
      productId: p.id,
      type: 'Correction',
      quantity: -1,
      reason: 'Count',
    }),
  );
  assert.throws(() =>
    f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Received', quantity: -1 }),
  );
  assert.throws(() =>
    f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Used', quantity: -1 }),
  );
  const a = f.book();
  assert.throws(() =>
    f.plan(a.id, [
      { productId: p.id, quantity: 1 },
      { productId: p.id, quantity: 1 },
    ]),
  );
});

test('cases have ordered same-pet checkpoints, different scheduling paths and no owner cancellation', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const c = f.clinic.cases.createCase(f.vets[0], {
    petId: f.pet.id,
    name: 'Luna limp',
    appointmentIds: [a.id],
  });
  const ownerStep = f.clinic.cases.checkpoint(f.vets[0], c.id, {
    symptoms: 'Follow up',
    petNeeded: true,
  });
  const lab = f.clinic.cases.checkpoint(f.vets[0], c.id, {
    symptoms: 'Lab sample',
    petNeeded: false,
    scheduledAt: addMinutes(TIME, 120),
    vetId: f.vets[0].id,
  });
  assert.equal(f.appointment(ownerStep.id).status, 'NeedsTime');
  assert.equal(f.appointment(lab.id).status, 'Confirmed');
  assert.equal(f.appointment(lab.id).checkpointOrder, 3);
  assert.equal(f.appointment(lab.id).petNeeded, false);
  denied(() => f.clinic.appointments.appointment(f.vets[0], lab.id, 'request-time', {}));
  for (const key of [a.id, ownerStep.id, lab.id])
    denied(() => f.clinic.appointments.appointment(f.owner, key, 'cancel', {}));
  f.clinic.appointments.appointment(f.owner, ownerStep.id, 'pick-time', {
    scheduledAt: addMinutes(TIME, 60),
  });
  f.clinic.appointments.appointment(f.vets[0], ownerStep.id, 'assign', { vetId: f.vets[1].id });
  assert.equal(f.appointment(ownerStep.id).status, 'Confirmed');
  const extra = f.book(addMinutes(TIME, 180));
  f.clinic.cases.attachCheckpoint(f.vets[0], c.id, { appointmentId: extra.id });
  assert.equal(f.appointment(extra.id).checkpointOrder, 4);
  denied(() => f.clinic.cases.attachCheckpoint(f.vets[0], c.id, { appointmentId: extra.id }));
});

test('BR-13: cancellation respects start time and terminal statuses', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  f.clock.value = Date.parse(TIME);
  denied(() => f.clinic.appointments.appointment(f.owner, a.id, 'cancel', {}));
});

test('BR-14: used visit types retained, rename/retire/restore and unused types deletable', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  f.plan(a.id);
  denied(() => f.clinic.configuration.deleteVisitType(f.vets[0], 'type-1'));
  f.clinic.configuration.visitType(f.vets[0], { name: 'Consultation', retired: true }, 'type-1');
  const b = f.book(addMinutes(TIME, 60));
  denied(() => f.plan(b.id));
  f.plan(a.id); // Existing usage may retain its retired type.
  f.clinic.configuration.visitType(f.vets[0], { name: 'Consultation', retired: false }, 'type-1');
  f.plan(b.id);
  const temp = f.clinic.configuration.visitType(f.vets[0], { name: 'Temporary' });
  f.clinic.configuration.deleteVisitType(f.vets[0], temp.id);
});

test('clinic timezone converts winter/summer correctly and preserves local opening hours', () => {
  const winter = clinicInstant('2030-01-07', 9, 0, 'America/Havana');
  const summer = clinicInstant('2030-07-08', 9, 0, 'America/Havana');
  assert.equal(winter, '2030-01-07T14:00:00.000Z');
  assert.equal(summer, '2030-07-08T13:00:00.000Z');
  assert.deepEqual(localParts(winter, 'America/Havana'), {
    date: '2030-01-07',
    hour: 9,
    minute: 0,
    second: 0,
  });
});

test('SQLite persists records across restarts and rolls back rejected changes', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vet-clinic-'));
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const path = join(dir, 'clinic.sqlite');
  const f = fixture({ path });
  const a = f.book();
  f.store.close();
  const store = new Store(path);
  assert.equal(store.read().appointments[0].id, a.id);
  assert.throws(() =>
    store.transaction((s) => {
      s.products.push({ id: 'bad', name: 'Bad', unit: 'ml', stock: 0 });
      throw Error('Rollback');
    }),
  );
  assert.equal(store.read().products.length, 0);
  const clinic = new Clinic(store);
  assert.equal(
    clinic.auth.login({ email: 'owner@example.com', password: PASSWORD }).user.id,
    f.owner.id,
  );
});

test('parallel processes competing for the last reservation cannot overbook SQLite', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vet-race-'));
  t.after(() => {
    f.store.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const path = join(dir, 'clinic.sqlite');
  const f = fixture({ path, vets: 1 });
  const clinicPath = resolve(__dirname, '../dist/clinic.js');
  const storePath = resolve(__dirname, '../dist/infrastructure/sqlite/store.js');
  const workerCode = `const { parentPort, workerData }=require('node:worker_threads'); const {Clinic}=require(workerData.clinicPath); const {Store}=require(workerData.storePath); const store=new Store(workerData.path); const clinic=new Clinic(store,undefined,()=>workerData.now,'America/Havana'); try{clinic.appointments.book(workerData.owner,{petId:workerData.petId,symptoms:'Race',scheduledAt:workerData.time});parentPort.postMessage('booked');}catch(e){parentPort.postMessage(e.getStatus?.()===409?'full':'error:'+e.message);}finally{store.close();}`;
  const compete = () =>
    new Promise<string>((resolve, reject) => {
      let result = '';
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          clinicPath,
          storePath,
          path,
          now: f.clock.value,
          owner: f.owner,
          petId: f.pet.id,
          time: TIME,
        },
      });
      worker.once('message', (message) => {
        result = message;
      });
      worker.once('error', reject);
      worker.once('exit', (code) =>
        code === 0 ? resolve(result) : reject(Error('Worker failed')),
      );
    });
  const results = await Promise.all([compete(), compete(), compete()]);
  assert.deepEqual(results.sort(), ['booked', 'full', 'full']);
  assert.equal(f.store.read().appointments.length, 1);
});
