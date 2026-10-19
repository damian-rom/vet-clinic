import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { HttpException } from '@nestjs/common';
import type { PlanInput } from '@vet-clinic/types';
import { Clinic } from '../src/clinic';
import { clinicInstant, localParts } from '../src/time';
import {
  fixture,
  readState,
  temporaryDirectory,
  testDatabase,
  DAY,
  PASSWORD,
  TIME,
} from './helpers';

function denied(fn: () => Promise<unknown>, status = 409) {
  return assert.rejects(fn, (e) => e instanceof HttpException && e.getStatus() === status);
}
const addMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60000).toISOString();

test('BR-1: personal accounts, clinic code only at signup, hashed passwords and sessions', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await denied(
    () =>
      f.clinic.auth.register(
        { name: 'Bad vet', email: 'bad@example.com', password: PASSWORD, clinicCode: 'wrong' },
        true,
      ),
    403,
  );
  const login = await f.clinic.auth.login({ email: 'VET0@example.com', password: PASSWORD });
  assert.equal(login.user.id, f.vets[0].id);
  assert.equal(login.user.role, 'vet');
  assert.ok(!JSON.stringify(login.user).includes('password'));
  assert.ok(!JSON.stringify(await readState(f.db)).includes(login.token));
  assert.ok(!JSON.stringify(await readState(f.db)).includes(PASSWORD));
  assert.equal((await f.clinic.auth.authenticate(login.token)).id, login.user.id);
  await f.clinic.auth.logout(login.token);
  await denied(async () => f.clinic.auth.authenticate(login.token), 401);
  const again = await f.clinic.auth.login({ email: 'owner@example.com', password: PASSWORD });
  f.clock.value += 8 * 86400000;
  await denied(async () => f.clinic.auth.authenticate(again.token), 401);
});

test('BR-2: owners receive only their own records and no planning, stock, calendars or AI fields', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  await f.plan(a.id);
  const other = (
    await f.clinic.auth.register({
      name: 'Other',
      email: 'other@example.com',
      password: PASSWORD,
    })
  ).user;
  const snapshot = await f.clinic.views.workspace(f.owner);
  assert.equal(snapshot.appointments.length, 1);
  for (const key of ['plan', 'actualActives', 'revision'])
    assert.ok(!(key in snapshot.appointments[0]));
  for (const key of ['timeBlocks', 'products', 'movements', 'owners', 'aiAvailable'])
    assert.ok(!(key in snapshot));
  assert.equal((await f.clinic.views.workspace(other)).pets.length, 0);
  await denied(async () => f.clinic.appointments.appointment(other, a.id, 'cancel', {}), 404);
  await denied(
    async () => f.clinic.inventory.createProduct(f.owner, { name: 'x', unit: 'ml' }),
    403,
  );
  await denied(async () => f.clinic.configuration.timeBlock(f.owner, {}), 403);
});

test('pet validation, editing, ownership, and safe deletion of pets without history', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  await assert.rejects(async () =>
    f.clinic.pets.pet(f.owner, { name: 'No age', species: 'Dog', sex: 'Male' }),
  );
  await assert.rejects(async () =>
    f.clinic.pets.pet(f.owner, {
      name: 'Bad birthday',
      species: 'Dog',
      sex: 'Male',
      dateOfBirth: '2025-02-30',
    }),
  );
  await f.clinic.pets.pet(
    f.owner,
    { name: 'Luna II', species: 'Cat', sex: 'Female', dateOfBirth: '2020-01-01' },
    f.pet.id,
  );
  assert.equal((await readState(f.db)).pets[0].name, 'Luna II');
  assert.equal((await readState(f.db)).pets[0].approximateAge, undefined);
  await f.clinic.pets.deletePet(f.owner, f.pet.id);
  assert.equal((await readState(f.db)).pets.length, 0);
});

test('BR-3: no capacity without veterinarians; fixed opening hours and future slots', async (t) => {
  const f = await fixture({ vets: 0 });
  t.after(() => f.db.close());
  assert.deepEqual((await f.clinic.appointments.slots(f.owner, DAY)).slots, []);
  await denied(async () => f.book());
  const g = await fixture();
  t.after(() => g.db.close());
  assert.equal((await g.clinic.appointments.slots(g.owner, DAY)).slots.length, 18);
  assert.equal((await g.clinic.appointments.slots(g.owner, '2030-01-12')).slots.length, 0);
  await denied(async () => g.book('2030-01-07T13:00:00Z'));
  await denied(async () => g.book('2030-01-07T14:15:00Z'));
  await denied(async () => g.book('2030-01-07T23:00:00Z'));
  await denied(async () => g.book('2020-01-01T14:00:00Z'));
});

test('BR-3: pending reservations count; cancellation immediately releases capacity and preserves history', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const b = await f.book();
  await denied(async () => f.book());
  assert.ok(!(await f.clinic.appointments.slots(f.owner, DAY)).slots.includes(TIME));
  await f.clinic.appointments.appointment(f.owner, a.id, 'cancel', {});
  assert.ok((await f.clinic.appointments.slots(f.owner, DAY)).slots.includes(TIME));
  assert.equal((await f.appointment(a.id)).status, 'Cancelled');
  assert.equal((await f.appointment(b.id)).status, 'AwaitingConfirmation');
  await denied(async () => f.clinic.pets.deletePet(f.owner, f.pet.id));
});

test('BR-4/5/6: humans assign; same-vet collisions rejected, separate vets can share times', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const b = await f.book();
  assert.equal((await f.appointment(a.id)).vetId, undefined);
  await f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
  await denied(
    async () =>
      await f.clinic.appointments.appointment(f.vets[0], b.id, 'assign', { vetId: f.vets[0].id }),
  );
  await f.clinic.appointments.appointment(f.vets[0], b.id, 'assign', { vetId: f.vets[1].id });
  assert.equal((await f.appointment(b.id)).status, 'Confirmed');
});

test('full-duration capacity, duration changes, and rescheduling share one collision rule', async (t) => {
  const f = await fixture({ vets: 1 });
  t.after(() => f.db.close());
  const a = await f.book();
  await f.plan(a.id, [], 60);
  assert.ok(
    !(await f.clinic.appointments.slots(f.owner, DAY)).slots.includes(addMinutes(TIME, 30)),
  );
  await denied(async () => f.book(addMinutes(TIME, 30)));
  const b = await f.book(addMinutes(TIME, 60));
  await f.plan(b.id);
  await f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
  await f.clinic.appointments.appointment(f.vets[0], b.id, 'assign', { vetId: f.vets[0].id });
  await denied(async () => f.plan(a.id, [], 90));
  assert.equal((await f.appointment(a.id)).plan?.durationMinutes, 60);
  await denied(
    async () =>
      await f.clinic.appointments.appointment(f.vets[0], b.id, 'reschedule', {
        scheduledAt: addMinutes(TIME, 30),
        revision: (await f.appointment(b.id)).revision,
      }),
  );
  assert.equal((await f.appointment(b.id)).scheduledAt, addMinutes(TIME, 60));
  await f.clinic.appointments.appointment(f.vets[0], b.id, 'reschedule', {
    scheduledAt: addMinutes(TIME, 120),
    revision: (await f.appointment(b.id)).revision,
  });
  await denied(
    async () =>
      await f.clinic.appointments.appointment(f.vets[0], b.id, 'reschedule', {
        scheduledAt: addMinutes(TIME, 150),
        revision: 0,
      }),
  );
});

test('BR-7: time blocks refuse pending and long appointments, then hide open slots', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  await f.plan(a.id, [], 90);
  await denied(
    async () =>
      await f.clinic.configuration.timeBlock(f.vets[0], {
        startsAt: addMinutes(TIME, 60),
        endsAt: addMinutes(TIME, 120),
      }),
  );
  await f.clinic.appointments.appointment(f.vets[0], a.id, 'request-time', {});
  const block = await f.clinic.configuration.timeBlock(f.vets[0], {
    startsAt: TIME,
    endsAt: addMinutes(TIME, 60),
    reason: 'Lunch',
  });
  assert.ok(!(await f.clinic.appointments.slots(f.owner, DAY)).slots.includes(TIME));
  await denied(
    async () =>
      await f.clinic.appointments.appointment(f.owner, a.id, 'pick-time', { scheduledAt: TIME }),
  );
  await f.clinic.configuration.deleteTimeBlock(f.vets[0], block.id);
  await f.clinic.appointments.appointment(f.owner, a.id, 'pick-time', { scheduledAt: TIME });
  assert.equal((await f.appointment(a.id)).status, 'AwaitingConfirmation');
  assert.equal((await f.appointment(a.id)).vetId, undefined);
});

test('BR-8/9: AI never confirms, keeps original draft, marks review and skips human work', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const b = await f.book(addMinutes(TIME, 60));
  await f.plan(b.id);
  const first = await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id, b.id] });
  assert.deepEqual(
    first.results.map((r) => r.outcome),
    ['drafted', 'skipped'],
  );
  assert.equal((await f.appointment(a.id)).status, 'AwaitingConfirmation');
  assert.equal((await f.appointment(a.id)).vetId, undefined);
  assert.equal((await f.appointment(a.id)).plan?.source, 'ai-draft');
  await f.plan(a.id, [], 45);
  const reviewed = (await f.appointment(a.id)).plan!;
  assert.equal(reviewed.source, 'ai-reviewed');
  assert.equal(reviewed.reviewedBy, f.vets[0].id);
  assert.equal(reviewed.originalDraft?.durationMinutes, 30);
  assert.equal(
    (await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] })).results[0].outcome,
    'skipped',
  );
  await assert.rejects(
    async () => await f.clinic.planning.draft(f.owner, { appointmentIds: [a.id] }),
  );
});

test('AI rechecks human changes while its provider is running', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  let release: (value: typeof f.ai.plan) => void = () => {};
  f.ai.draft = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] });
  await f.plan(a.id, [], 60);
  release(f.ai.plan);
  assert.equal((await pending).results[0].outcome, 'skipped');
  assert.equal((await f.appointment(a.id)).plan?.durationMinutes, 60);
});

test('AI validates unknown IDs and collisions without partially saving a draft', async (t) => {
  const f = await fixture({ vets: 1 });
  t.after(() => f.db.close());
  const a = await f.book();
  const b = await f.book(addMinutes(TIME, 30));
  f.ai.plan.durationMinutes = 60;
  assert.equal(
    (await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] })).results[0].outcome,
    'failed',
  );
  assert.equal((await f.appointment(a.id)).plan, undefined);
  f.ai.plan = { visitTypeId: 'missing', durationMinutes: 30, estimatedActives: [] };
  assert.equal(
    (await f.clinic.planning.draft(f.vets[0], { appointmentIds: [b.id] })).results[0].outcome,
    'failed',
  );
});

test('BR-10/11/12: forecasting warns without changing stock; completion is atomic and never negative', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const p = await f.clinic.inventory.createProduct(f.vets[0], { name: 'Vaccine', unit: 'dose' });
  const q = await f.clinic.inventory.createProduct(f.vets[0], { name: 'Suture', unit: 'kit' });
  await f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Received', quantity: 1 });
  await f.plan(a.id, [
    { productId: p.id, quantity: 2 },
    { productId: q.id, quantity: 1 },
  ]);
  assert.equal((await readState(f.db)).products.find((x) => x.id === p.id)!.stock, 1);
  assert.equal((await readState(f.db)).movements.length, 1);
  await f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
  await denied(
    async () =>
      await f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', {
        actualActives: [],
        revision: (await f.appointment(a.id)).revision,
      }),
  );
  f.clock.value = Date.parse(TIME) + 60000;
  await denied(
    async () =>
      await f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', {
        actualActives: [
          { productId: p.id, quantity: 1 },
          { productId: q.id, quantity: 1 },
        ],
        revision: (await f.appointment(a.id)).revision,
      }),
  );
  assert.equal((await readState(f.db)).products.find((x) => x.id === p.id)!.stock, 1);
  assert.equal((await readState(f.db)).movements.length, 1);
  assert.equal((await f.appointment(a.id)).status, 'Confirmed');
  await assert.rejects(async () =>
    f.clinic.inventory.movement(f.vets[0], { productId: q.id, type: 'Correction', quantity: 1 }),
  );
  await f.clinic.inventory.movement(f.vets[0], {
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
    revision: (await f.appointment(a.id)).revision,
  };
  await f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', data);
  assert.equal((await f.appointment(a.id)).status, 'Done');
  assert.ok((await readState(f.db)).products.every((p) => p.stock === 0));
  assert.equal(
    (await readState(f.db)).movements.filter((m) => m.type === 'Used' && m.appointmentId === a.id)
      .length,
    2,
  );
  assert.ok(
    (await readState(f.db)).movements.every((m) => m.performedBy === f.vets[0].id && m.performedAt),
  );
  await denied(async () => f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', data));
});

test('inventory demand includes planned checkpoints still waiting for an owner time', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const product = await f.clinic.inventory.createProduct(f.vets[0], {
    name: 'Lab kit',
    unit: 'kit',
  });
  const careCase = await f.clinic.cases.createCase(f.vets[0], {
    petId: f.pet.id,
    name: 'Lab follow-up',
  });
  const checkpoint = await f.clinic.cases.checkpoint(f.vets[0], careCase.id, {
    symptoms: 'Recheck',
    petNeeded: true,
  });
  await f.plan(checkpoint.id, [{ productId: product.id, quantity: 2 }]);
  const workspace = await f.clinic.views.workspace(f.vets[0]);
  assert.ok('products' in workspace);
  assert.equal(workspace.products[0].needed, 2);
  assert.equal(workspace.products[0].stock, 0);
});

test('stock validation forbids negative balances, duplicate usage, manual Used and negative deliveries', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const p = await f.clinic.inventory.createProduct(f.vets[0], { name: 'Dose', unit: 'dose' });
  await denied(
    async () =>
      await f.clinic.inventory.movement(f.vets[0], {
        productId: p.id,
        type: 'Correction',
        quantity: -1,
        reason: 'Count',
      }),
  );
  await assert.rejects(async () =>
    f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Received', quantity: -1 }),
  );
  await assert.rejects(async () =>
    f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Used', quantity: -1 }),
  );
  const a = await f.book();
  await assert.rejects(async () =>
    f.plan(a.id, [
      { productId: p.id, quantity: 1 },
      { productId: p.id, quantity: 1 },
    ]),
  );
});

test('cases have ordered same-pet checkpoints, different scheduling paths and no owner cancellation', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const c = await f.clinic.cases.createCase(f.vets[0], {
    petId: f.pet.id,
    name: 'Luna limp',
    appointmentIds: [a.id],
  });
  const ownerStep = await f.clinic.cases.checkpoint(f.vets[0], c.id, {
    symptoms: 'Follow up',
    petNeeded: true,
  });
  const lab = await f.clinic.cases.checkpoint(f.vets[0], c.id, {
    symptoms: 'Lab sample',
    petNeeded: false,
    scheduledAt: addMinutes(TIME, 120),
    vetId: f.vets[0].id,
  });
  assert.equal((await f.appointment(ownerStep.id)).status, 'NeedsTime');
  assert.equal((await f.appointment(lab.id)).status, 'Confirmed');
  assert.equal((await f.appointment(lab.id)).checkpointOrder, 3);
  assert.equal((await f.appointment(lab.id)).petNeeded, false);
  await denied(async () =>
    f.clinic.appointments.appointment(f.vets[0], lab.id, 'request-time', {}),
  );
  for (const key of [a.id, ownerStep.id, lab.id])
    await denied(async () => f.clinic.appointments.appointment(f.owner, key, 'cancel', {}));
  await f.clinic.appointments.appointment(f.owner, ownerStep.id, 'pick-time', {
    scheduledAt: addMinutes(TIME, 60),
  });
  await f.clinic.appointments.appointment(f.vets[0], ownerStep.id, 'assign', {
    vetId: f.vets[1].id,
  });
  assert.equal((await f.appointment(ownerStep.id)).status, 'Confirmed');
  const extra = await f.book(addMinutes(TIME, 180));
  await f.clinic.cases.attachCheckpoint(f.vets[0], c.id, { appointmentId: extra.id });
  assert.equal((await f.appointment(extra.id)).checkpointOrder, 4);
  await denied(async () =>
    f.clinic.cases.attachCheckpoint(f.vets[0], c.id, { appointmentId: extra.id }),
  );
});

test('BR-13: cancellation respects start time and terminal statuses', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  f.clock.value = Date.parse(TIME);
  await denied(async () => f.clinic.appointments.appointment(f.owner, a.id, 'cancel', {}));
});

test('BR-14: used visit types retained, rename/retire/restore and unused types deletable', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  await f.plan(a.id);
  await denied(async () => f.clinic.configuration.deleteVisitType(f.vets[0], 'type-1'));
  await f.clinic.configuration.visitType(
    f.vets[0],
    { name: 'Consultation', retired: true },
    'type-1',
  );
  const b = await f.book(addMinutes(TIME, 60));
  await denied(async () => f.plan(b.id));
  await f.plan(a.id); // Existing usage may retain its retired type.
  await f.clinic.configuration.visitType(
    f.vets[0],
    { name: 'Consultation', retired: false },
    'type-1',
  );
  await f.plan(b.id);
  const temp = await f.clinic.configuration.visitType(f.vets[0], { name: 'Temporary' });
  await f.clinic.configuration.deleteVisitType(f.vets[0], temp.id);
});

test('plans list materials unless their visit type marks them optional, for vets and AI alike', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const vaccine = await f.clinic.inventory.createProduct(f.vets[0], {
    name: 'Vaccine',
    unit: 'dose',
  });
  const save = async (visitTypeId: string, estimatedActives: PlanInput['estimatedActives']) =>
    f.clinic.appointments.appointment(f.vets[0], a.id, 'plan', {
      visitTypeId,
      durationMinutes: 30,
      estimatedActives,
      revision: (await f.appointment(a.id)).revision,
    });
  await assert.rejects(() => save('type-4', []), /must list the materials it uses/);
  await save('type-4', [{ productId: vaccine.id, quantity: 1 }]);
  // Renaming keeps the setting: it lives on the visit type, not its name.
  await f.clinic.configuration.visitType(f.vets[0], { name: 'Consultation' }, 'type-1');
  await save('type-1', []);

  const b = await f.book(addMinutes(TIME, 60));
  f.ai.plan = { visitTypeId: 'type-4', durationMinutes: 30, estimatedActives: [] };
  const drafted = await f.clinic.planning.draft(f.vets[0], { appointmentIds: [b.id] });
  assert.equal(drafted.results[0].outcome, 'failed');
  await f.clinic.configuration.visitType(
    f.vets[0],
    { name: 'Vaccination', materialsOptional: true },
    'type-4',
  );
  const retried = await f.clinic.planning.draft(f.vets[0], { appointmentIds: [b.id] });
  assert.equal(retried.results[0].outcome, 'drafted');
});

test('clinic timezone converts winter/summer correctly and preserves local opening hours', async () => {
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

test('SQLite persists records across restarts and rolls back rejected changes', async (t) => {
  const path = join(temporaryDirectory(), 'clinic.sqlite');
  const f = await fixture({ path });
  const a = await f.book();
  await f.db.close();
  const db = await testDatabase(path);
  t.after(() => db.close());
  assert.equal((await readState(db)).appointments[0].id, a.id);
  await assert.rejects(() =>
    db.write(async (tx) => {
      await tx.product.create({ data: { id: 'bad', name: 'Bad', unit: 'ml', stock: 0 } });
      throw Error('Rollback');
    }),
  );
  assert.equal((await readState(db)).products.length, 0);
  const clinic = new Clinic(db);
  assert.equal(
    (await clinic.auth.login({ email: 'owner@example.com', password: PASSWORD })).user.id,
    f.owner.id,
  );
});

test('parallel processes competing for the last reservation cannot overbook SQLite', async (t) => {
  const path = join(temporaryDirectory('vet-race-'), 'clinic.sqlite');
  const f = await fixture({ path, vets: 1 });
  t.after(() => f.db.close());
  const clinicPath = resolve(__dirname, '../dist/clinic.js');
  const workerCode = `const { parentPort, workerData }=require('node:worker_threads'); const {Clinic}=require(workerData.clinicPath); const {openDatabase}=require('@vet-clinic/db'); (async()=>{const db=await openDatabase(workerData.path); const clinic=new Clinic(db,undefined,()=>workerData.now,'America/Havana'); try{await clinic.appointments.book(workerData.owner,{petId:workerData.petId,symptoms:'Race',scheduledAt:workerData.time});parentPort.postMessage('booked');}catch(e){parentPort.postMessage(e.getStatus?.()===409?'full':'error:'+e.message);}finally{await db.close();}})();`;
  const compete = () =>
    new Promise<string>((resolve, reject) => {
      let result = '';
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: {
          clinicPath,
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
  assert.equal((await readState(f.db)).appointments.length, 1);
});
