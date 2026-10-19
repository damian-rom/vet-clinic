import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clinic } from '../src/clinic';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from '../src/demo/seed';
import { Store } from '../src/infrastructure/prisma/repositories';
import { clinicInstant, localParts } from '../src/time';
import { FakeEmailAdapter, FakePlanningAdapter, readState, testDatabase } from './helpers';

const now = Date.parse('2030-01-06T23:30:00.000Z');
const timezone = 'America/Havana';

test('presentation seed creates consistent scenarios, keeps existing records and permits every demo login', async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  await db.write((tx) =>
    tx.user.create({
      data: {
        id: 'existing-user',
        name: 'Keep me',
        email: 'existing@example.com',
        role: 'owner',
        passwordHash: 'unchanged',
      },
    }),
  );
  assert.equal(await seedDemo(db, { now, timezone }), true);
  const state = await readState(db);
  assert.equal(state.users.length, 5);
  assert.equal(state.users.find((user) => user.id === 'existing-user')!.passwordHash, 'unchanged');
  assert.equal(state.pets.length, 4);
  assert.equal(state.appointments.length, 13);
  assert.equal(state.cases.length, 1);
  assert.equal(state.products.length, 5);
  assert.equal(state.movements.length, 9);
  assert.equal(await db.client.weeklyTimeBlock.count(), 5);
  for (const product of state.products) {
    const balance = state.movements
      .filter((movement) => movement.productId === product.id)
      .reduce((sum, movement) => sum + movement.quantity, 0);
    assert.equal(product.stock, balance);
    assert.ok(product.stock >= 0);
  }
  const email = new FakeEmailAdapter();
  const clinic = new Clinic(db, new FakePlanningAdapter(), () => now, timezone, email);
  for (const account of Object.values(DEMO_ACCOUNTS)) {
    const session = await clinic.auth.login({ email: account.email, password: DEMO_PASSWORD });
    assert.equal(session.user.role, account.role);
    assert.equal((await clinic.auth.authenticate(session.token)).id, account.id);
    await clinic.auth.logout(session.token);
  }
  const workspace = await clinic.views.workspace(DEMO_ACCOUNTS.ana);
  assert.ok('products' in workspace);
  const dressing = workspace.products.find((product) => product.name === 'Specialty dressing')!;
  assert.equal(dressing.stock, 1);
  assert.equal(dressing.needed, 3);
  const owner = await clinic.views.workspace(DEMO_ACCOUNTS.sofia);
  assert.equal(owner.pets.length, 2);
  assert.ok(owner.appointments.every((appointment) => !('plan' in appointment)));
  const history = await clinic.views.history(DEMO_ACCOUNTS.ana, { before: workspace.historySince });
  assert.ok(
    history.appointments.some((appointment) => appointment.id === 'demo-visit-milo-history'),
  );
  for (const appointment of state.appointments.filter(
    (visit) =>
      ['AwaitingConfirmation', 'Confirmed'].includes(visit.status) &&
      visit.scheduledAt &&
      Date.parse(visit.scheduledAt) > now,
  ))
    await new Store(db).read((repos) => clinic.appointments.reserve(repos, appointment));
  assert.deepEqual(email.messages, []);
});

test('repeated and concurrent seeding does not duplicate records or reset rehearsal edits', async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  assert.deepEqual((await Promise.all([seedDemo(db, { now }), seedDemo(db, { now })])).sort(), [
    false,
    true,
  ]);
  await db.write((tx) =>
    tx.pet.update({ where: { id: 'demo-pet-luna' }, data: { notes: 'Changed during rehearsal' } }),
  );
  const before = await readState(db);
  assert.equal(await seedDemo(db, { now: now + 7 * 86400_000 }), false);
  assert.deepEqual(await readState(db), before);
});

test('sample records support completion, inventory audit, checkpoint confirmation, AI review and PDF email', async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  await seedDemo(db, { now, ownerEmail: 'Presenter@example.com' });
  const email = new FakeEmailAdapter();
  const clinic = new Clinic(db, new FakePlanningAdapter(), () => now, timezone, email);
  const vet = DEMO_ACCOUNTS.ana;
  const owner = (
    await clinic.auth.login({ email: 'presenter@example.com', password: DEMO_PASSWORD })
  ).user;
  const appointment = (id: string) => new Store(db).read((repos) => repos.appointments.get(id));
  const ready = await appointment('demo-visit-luna-ready');
  await clinic.appointments.appointment(vet, ready.id, 'complete', {
    revision: ready.revision,
    actualActives: [{ productId: 'demo-product-vaccine', quantity: 1 }],
  });
  assert.equal(
    (await db.client.product.findUnique({ where: { id: 'demo-product-vaccine' } }))!.stock,
    18,
  );
  assert.equal(
    await db.client.movement.count({ where: { appointmentId: ready.id, type: 'Used' } }),
    1,
  );
  await assert.rejects(() =>
    clinic.appointments.appointment(vet, ready.id, 'complete', {
      revision: ready.revision,
      actualActives: [],
    }),
  );
  const checkpoint = 'demo-visit-luna-followup';
  await clinic.appointments.appointment(owner, checkpoint, 'pick-time', {
    scheduledAt: clinicInstant('2030-01-08', 10, 0, timezone),
  });
  await clinic.appointments.appointment(vet, checkpoint, 'assign', { vetId: vet.id });
  assert.equal((await appointment(checkpoint)).status, 'Confirmed');
  const draft = await appointment('demo-visit-luna-draft');
  await clinic.appointments.appointment(vet, draft.id, 'plan', {
    visitTypeId: draft.plan!.visitTypeId,
    durationMinutes: 45,
    estimatedActives: draft.plan!.estimatedActives,
    revision: draft.revision,
  });
  const reviewed = (await appointment(draft.id)).plan!;
  assert.equal(reviewed.source, 'ai-reviewed');
  assert.equal(reviewed.originalDraft!.durationMinutes, 30);
  const filters = { from: '2029-01-01', to: '2030-12-31' };
  for (const kind of ['care-history', 'clinic-activity', 'inventory-usage'])
    assert.ok((await clinic.reports.build(vet, kind, filters)).rows.length > 0);
  await clinic.reports.emailReport(owner, 'care-history', filters);
  assert.equal(email.messages.length, 1);
  assert.equal(email.messages[0].to, 'presenter@example.com');
  assert.equal(email.messages[0].pdf.subarray(0, 5).toString(), '%PDF-');
});

test('an existing email collision rolls back the entire presentation dataset', async (t) => {
  const db = await testDatabase();
  t.after(() => db.close());
  await db.write((tx) =>
    tx.user.create({
      data: {
        id: 'existing-owner',
        name: 'Original',
        email: DEMO_ACCOUNTS.ana.email,
        role: 'owner',
        passwordHash: 'original',
      },
    }),
  );
  const before = await readState(db);
  await assert.rejects(() => seedDemo(db, { now }));
  assert.deepEqual(await readState(db), before);
});

for (const instant of ['2030-03-10T12:00:00Z', '2030-11-02T23:30:00Z']) {
  test('sample visits use future clinic weekdays around clock changes: ' + instant, async (t) => {
    const db = await testDatabase();
    t.after(() => db.close());
    const seedNow = Date.parse(instant);
    await seedDemo(db, { now: seedNow, timezone });
    const visit = (await db.client.appointment.findUnique({
      where: { id: 'demo-visit-luna-booking' },
    }))!;
    const parts = localParts(visit.scheduledAt!, timezone);
    assert.equal(parts.hour, 9);
    assert.equal(parts.minute, 0);
    assert.ok(Date.parse(visit.scheduledAt!) > seedNow);
    assert.ok(![0, 6].includes(new Date(parts.date + 'T12:00:00Z').getUTCDay()));
  });
}
