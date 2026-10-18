import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { openDatabase, PRISMA_CONFIG_PATH } from '@vet-clinic/db';
import { Clinic } from '../src/clinic';
import {
  fixture,
  migrateDatabase,
  PASSWORD,
  readState,
  temporaryDirectory,
  testDatabase,
  TIME,
} from './helpers';

const prisma = (args: string[], url: string) =>
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), ...args, '--config', PRISMA_CONFIG_PATH],
    { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' },
  );

test('the committed migrations match the Prisma schema', () => {
  const path = join(temporaryDirectory(), 'clinic.sqlite');
  migrateDatabase(path);
  const schema = join(PRISMA_CONFIG_PATH, '../prisma/schema.prisma');
  // --exit-code fails with status 2 when the schema and the database differ.
  prisma(
    ['migrate', 'diff', '--from-config-datasource', '--to-schema', schema, '--exit-code'],
    `file:${path}`,
  );
});

test('an unmigrated database is refused before any data is written', async () => {
  const path = join(temporaryDirectory(), 'clinic.sqlite');
  await assert.rejects(() => openDatabase(path), /Run pnpm db:migrate/);
});

test('relational writes preserve optional values, booleans, decimals, reordered estimates and cleared nested data', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const a = await f.book();
  const p = await f.clinic.inventory.createProduct(f.vets[0], { name: 'A', unit: 'ml' });
  const q = await f.clinic.inventory.createProduct(f.vets[0], { name: 'B', unit: 'dose' });
  await f.plan(a.id, [
    { productId: p.id, quantity: 0.125 },
    { productId: q.id, quantity: 2.5 },
  ]);
  await f.plan(a.id, [
    { productId: q.id, quantity: 2 },
    { productId: p.id, quantity: 0.25 },
  ]);
  assert.deepEqual((await f.appointment(a.id)).plan!.estimatedActives, [
    { productId: q.id, quantity: 2 },
    { productId: p.id, quantity: 0.25 },
  ]);
  await f.clinic.appointments.appointment(f.vets[0], a.id, 'request-time', {});
  const waiting = await f.appointment(a.id);
  assert.equal(waiting.scheduledAt, undefined);
  assert.equal(waiting.vetId, undefined);
  assert.ok(!('actualActives' in waiting));
  await f.clinic.pets.pet(
    f.owner,
    { name: 'Luna', species: 'Cat', sex: 'Female', dateOfBirth: '2020-01-02', weight: 4.25 },
    f.pet.id,
  );
  const pet = (await readState(f.db)).pets[0];
  assert.equal(pet.weight, 4.25);
  assert.equal(pet.approximateAge, undefined);
  const careCase = await f.clinic.cases.createCase(f.vets[0], {
    petId: f.pet.id,
    name: 'Recovery',
    appointmentIds: [a.id],
  });
  const lab = await f.clinic.cases.checkpoint(f.vets[0], careCase.id, {
    symptoms: 'Review sample',
    petNeeded: false,
    scheduledAt: new Date(Date.parse(TIME) + 120 * 60000).toISOString(),
    vetId: f.vets[1].id,
  });
  assert.equal((await f.appointment(a.id)).petNeeded, true);
  assert.equal((await f.appointment(lab.id)).petNeeded, false);
  await f.plan(lab.id);
  f.clock.value = Date.parse(TIME) + 180 * 60000;
  await f.clinic.appointments.appointment(f.vets[0], lab.id, 'complete', {
    actualActives: [],
    revision: (await f.appointment(lab.id)).revision,
  });
  assert.deepEqual((await f.appointment(lab.id)).actualActives, []);
  assert.deepEqual((await readState(f.db)).cases[0].checkpointIds, [a.id, lab.id]);
});

test('database constraints reject invalid references, duplicate emails, negative stock and invalid values atomically', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const raw = (sql: string, ...values: string[]) =>
    f.db.write((tx) => tx.$executeRawUnsafe(sql, ...values));
  const before = await readState(f.db);
  await assert.rejects(
    () => raw("UPDATE users SET email='OWNER@EXAMPLE.COM' WHERE role='vet'"),
    /unique constraint/i,
  );
  await assert.rejects(() => raw("UPDATE users SET role='admin'"), /check constraint/i);
  await assert.rejects(() => raw('UPDATE visit_types SET retired=2'), /check constraint/i);
  await assert.rejects(
    () => raw("INSERT INTO products (id,name,unit,stock) VALUES ('bad','Bad','ml',-1)"),
    /check constraint/i,
  );
  await assert.rejects(
    () =>
      raw(
        "INSERT INTO movements (id,product_id,type,quantity,performed_by,performed_at) VALUES ('m','p','Correction',1,'u','x')",
      ),
    /check constraint|foreign key/i,
  );
  await assert.rejects(
    () =>
      f.db.write(async (tx) => {
        await tx.product.create({ data: { id: 'temporary', name: 'Valid', unit: 'ml', stock: 1 } });
        await tx.session.create({ data: { id: 'bad', userId: 'missing', expiresAt: 1n } });
      }),
    /foreign key/i,
  );
  assert.deepEqual(await readState(f.db), before);
  const a = await f.book();
  await assert.rejects(() =>
    f.clinic.appointments.appointment(f.vets[0], a.id, 'plan', {
      visitTypeId: 'type-1',
      durationMinutes: 30,
      estimatedActives: [{ productId: 'missing', quantity: 1 }],
      revision: 0,
    }),
  );
  assert.equal((await f.appointment(a.id)).plan, undefined);
  assert.equal(await f.db.read((tx) => tx.appointmentPlan.count()), 0);
  assert.deepEqual(await f.db.read((tx) => tx.$queryRawUnsafe('PRAGMA foreign_key_check')), []);
});

test('case membership, pet ownership and historical references are enforced by relational constraints', async (t) => {
  const f = await fixture();
  t.after(() => f.db.close());
  const raw = (sql: string, ...values: string[]) =>
    f.db.write((tx) => tx.$executeRawUnsafe(sql, ...values));
  const a = await f.book();
  const otherOwner = (
    await f.clinic.auth.register({ name: 'Other', email: 'other@example.com', password: PASSWORD })
  ).user;
  await assert.rejects(
    () => raw('UPDATE appointments SET owner_id=? WHERE id=?', otherOwner.id, a.id),
    /foreign key/i,
  );
  const careCase = await f.clinic.cases.createCase(f.vets[0], {
    petId: f.pet.id,
    name: 'Care',
    appointmentIds: [a.id],
  });
  await assert.rejects(
    () => raw('UPDATE appointments SET checkpoint_order=NULL WHERE id=?', a.id),
    /check constraint/i,
  );
  await assert.rejects(() => raw('DELETE FROM cases WHERE id=?', careCase.id), /foreign key/i);
  await assert.rejects(() => raw('DELETE FROM pets WHERE id=?', f.pet.id), /foreign key/i);
  await f.plan(a.id);
  await assert.rejects(() => raw("DELETE FROM visit_types WHERE id='type-1'"), /foreign key/i);
});

test('a reopened database keeps accounts, sessions and records', async () => {
  const path = join(temporaryDirectory(), 'clinic.sqlite');
  const f = await fixture({ path });
  const session = await f.clinic.auth.login({ email: f.owner.email, password: PASSWORD });
  const state = await readState(f.db);
  await f.db.close();
  const db = await testDatabase(path);
  try {
    assert.deepEqual(await readState(db), state);
    const clinic = new Clinic(db, undefined, () => f.clock.value);
    assert.equal((await clinic.auth.authenticate(session.token)).id, f.owner.id);
  } finally {
    await db.close();
  }
});
