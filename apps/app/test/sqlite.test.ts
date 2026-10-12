import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Clinic } from '../src/clinic';
import { Store } from '../src/infrastructure/sqlite/store';
import { collections, type State } from '../src/infrastructure/sqlite/entities';
import { fixture, PASSWORD, TIME } from './helpers';

function temporaryDatabase(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'vet-relational-'));
  t.after(() => {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep));
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return join(directory, 'clinic.sqlite');
}

function writeLegacyDatabase(path: string, state: State): void {
  const db = new DatabaseSync(path);
  try {
    for (const table of collections) {
      db.exec(
        `CREATE TABLE ${table} (id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document)))`,
      );
      const insert = db.prepare(`INSERT INTO ${table} (id, document) VALUES (?, ?)`);
      for (const entity of state[table]) insert.run(entity.id, JSON.stringify(entity));
    }
  } finally {
    db.close();
  }
}

const later = (minutes: number) => new Date(Date.parse(TIME) + minutes * 60000).toISOString();

async function fullClinicState() {
  const f = fixture();
  try {
    f.clinic.pets.pet(
      f.owner,
      {
        name: 'Luna',
        species: 'Cat',
        sex: 'Female',
        dateOfBirth: '2020-01-02',
        approximateAge: '10 years',
        breed: 'Siamese',
        weight: 4.25,
        notes: 'Keep all fields',
      },
      f.pet.id,
    );
    const p = f.clinic.inventory.createProduct(f.vets[0], { name: 'Vaccine', unit: 'dose' });
    const q = f.clinic.inventory.createProduct(f.vets[0], { name: 'Solution', unit: 'ml' });
    f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Received', quantity: 10 });
    f.clinic.inventory.movement(f.vets[0], {
      productId: q.id,
      type: 'Correction',
      quantity: 7.5,
      reason: 'Shelf count',
    });
    const a = f.book();
    f.ai.plan = {
      visitTypeId: 'type-1',
      durationMinutes: 30,
      estimatedActives: [
        { productId: p.id, quantity: 1 },
        { productId: q.id, quantity: 0.5 },
      ],
    };
    await f.clinic.planning.draft(f.vets[0], { appointmentIds: [a.id] });
    f.plan(
      a.id,
      [
        { productId: q.id, quantity: 1.25 },
        { productId: p.id, quantity: 2 },
      ],
      45,
    );
    f.clinic.appointments.appointment(f.vets[0], a.id, 'assign', { vetId: f.vets[0].id });
    const careCase = f.clinic.cases.createCase(f.vets[0], {
      petId: f.pet.id,
      name: 'Recovery',
      appointmentIds: [a.id],
    });
    const lab = f.clinic.cases.checkpoint(f.vets[0], careCase.id, {
      symptoms: 'Review sample',
      petNeeded: false,
      scheduledAt: later(120),
      vetId: f.vets[1].id,
    });
    f.plan(lab.id);
    const followUp = f.clinic.cases.checkpoint(f.vets[0], careCase.id, {
      symptoms: 'Recheck',
      petNeeded: true,
    });
    f.plan(followUp.id, [{ productId: p.id, quantity: 1 }]);
    f.clock.value = Date.parse(later(180));
    f.clinic.appointments.appointment(f.vets[0], a.id, 'complete', {
      actualActives: [
        { productId: q.id, quantity: 0.75 },
        { productId: p.id, quantity: 1 },
      ],
      revision: f.appointment(a.id).revision,
    });
    f.clinic.appointments.appointment(f.vets[0], lab.id, 'complete', {
      actualActives: [],
      revision: f.appointment(lab.id).revision,
    });
    const cancelled = f.book(later(240));
    f.clinic.appointments.appointment(f.owner, cancelled.id, 'cancel', {});
    f.clinic.configuration.timeBlock(f.vets[0], {
      startsAt: later(300),
      endsAt: later(330),
      reason: 'Staff meeting',
    });
    f.clinic.configuration.visitType(f.vets[0], { name: 'Consultation', retired: true }, 'type-1');
    const session = f.clinic.auth.login({ email: f.owner.email, password: PASSWORD });
    return { state: f.store.read(), token: session.token, now: f.clock.value };
  } finally {
    f.store.close();
  }
}

test('legacy migration preserves every field, nested rows, collection order, login and sessions across restarts', async (t) => {
  const path = temporaryDatabase(t);
  const { state, token, now } = await fullClinicState();
  writeLegacyDatabase(path, state);
  const store = new Store(path);
  try {
    assert.deepEqual(store.read(), state);
    assert.equal(store.query('PRAGMA user_version')[0].user_version, 1);
    assert.deepEqual(store.query('PRAGMA foreign_key_check'), []);
    const tables = store.query(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    assert.equal(tables.length, 14);
    for (const { name } of tables) {
      const columns = store.query(`PRAGMA table_info(${name})`).map((column) => column.name);
      assert.ok(!columns.includes('document'));
      assert.ok(!String(name).startsWith('legacy_'));
    }
    const clinic = new Clinic(store, undefined, () => now);
    assert.equal(
      clinic.auth.authenticate(token).id,
      state.users.find((user) => user.role === 'owner')!.id,
    );
    assert.equal(
      clinic.reports.build(state.users[0], 'clinic-activity', {
        from: '2030-01-01',
        to: '2030-12-31',
      }).rows.length,
      4,
    );
    assert.equal(
      clinic.reports.build(state.users[0], 'inventory-usage', {
        from: '2030-01-01',
        to: '2030-12-31',
      }).rows.length,
      4,
    );
  } finally {
    store.close();
  }
  const reopened = new Store(path);
  try {
    assert.deepEqual(reopened.read(), state);
    const clinic = new Clinic(reopened, undefined, () => now);
    assert.equal(
      clinic.auth.login({ email: 'owner@example.com', password: PASSWORD }).user.id,
      state.pets[0].ownerId,
    );
  } finally {
    reopened.close();
  }
});

test('relational writes preserve optional values, booleans, decimals, reordered estimates and cleared nested data', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const p = f.clinic.inventory.createProduct(f.vets[0], { name: 'A', unit: 'ml' });
  const q = f.clinic.inventory.createProduct(f.vets[0], { name: 'B', unit: 'dose' });
  f.plan(a.id, [
    { productId: p.id, quantity: 0.125 },
    { productId: q.id, quantity: 2.5 },
  ]);
  f.plan(a.id, [
    { productId: q.id, quantity: 2 },
    { productId: p.id, quantity: 0.25 },
  ]);
  assert.deepEqual(f.appointment(a.id).plan!.estimatedActives, [
    { productId: q.id, quantity: 2 },
    { productId: p.id, quantity: 0.25 },
  ]);
  f.store.transaction((state) => {
    state.appointments[0].actualActives = [];
    delete state.appointments[0].plan;
    delete state.appointments[0].scheduledAt;
    state.appointments[0].status = 'NeedsTime';
  });
  assert.deepEqual(f.appointment(a.id).actualActives, []);
  assert.equal(f.appointment(a.id).plan, undefined);
  assert.equal(f.appointment(a.id).scheduledAt, undefined);
  assert.equal(f.store.query('SELECT * FROM appointment_estimated_actives').length, 0);
  f.store.transaction((state) => {
    delete state.appointments[0].actualActives;
  });
  assert.ok(!('actualActives' in f.appointment(a.id)));
});

test('database constraints reject invalid references, duplicate emails, negative stock and invalid scalar values atomically', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const before = f.store.read();
  assert.throws(
    () => f.store.query("UPDATE users SET email='OWNER@EXAMPLE.COM' WHERE role='vet'"),
    /UNIQUE/,
  );
  assert.throws(() => f.store.query("UPDATE users SET role='admin'"), /CHECK/);
  assert.throws(() => f.store.query('UPDATE visit_types SET retired=2'), /CHECK/);
  assert.throws(
    () => f.store.query("INSERT INTO products (id,name,unit,stock) VALUES ('bad','Bad','ml',-1)"),
    /CHECK/,
  );
  assert.throws(
    () => f.store.query("INSERT INTO sessions (id,user_id,expires_at) VALUES ('bad','missing',1)"),
    /FOREIGN KEY/,
  );
  assert.throws(
    () =>
      f.store.transaction((state) => {
        state.products.push({ id: 'temporary', name: 'Valid', unit: 'ml', stock: 1 });
        state.pets[0].ownerId = 'missing';
      }),
    /FOREIGN KEY/,
  );
  assert.deepEqual(f.store.read(), before);
  const a = f.book();
  assert.throws(
    () =>
      f.store.transaction((state) => {
        state.appointments[0].plan = {
          visitTypeId: 'type-1',
          durationMinutes: 30,
          source: 'human',
          savedAt: TIME,
          estimatedActives: [{ productId: 'missing', quantity: 1 }],
        };
      }),
    /FOREIGN KEY/,
  );
  assert.equal(f.appointment(a.id).plan, undefined);
  assert.equal(f.store.query('SELECT * FROM appointment_plans').length, 0);
  assert.deepEqual(f.store.query('PRAGMA foreign_key_check'), []);
});

test('case membership, pet ownership and historical references are enforced by relational constraints', (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  const otherOwner = f.clinic.auth.register({
    name: 'Other',
    email: 'other@example.com',
    password: PASSWORD,
  }).user;
  assert.throws(
    () => f.store.query('UPDATE appointments SET owner_id=? WHERE id=?', otherOwner.id, a.id),
    /FOREIGN KEY/,
  );
  const careCase = f.clinic.cases.createCase(f.vets[0], {
    petId: f.pet.id,
    name: 'Care',
    appointmentIds: [a.id],
  });
  assert.throws(
    () =>
      f.store.transaction((state) => {
        state.cases[0].checkpointIds = [];
      }),
    /checkpoint IDs/,
  );
  assert.deepEqual(f.store.read().cases[0].checkpointIds, [a.id]);
  assert.throws(() => f.store.query('DELETE FROM cases WHERE id=?', careCase.id), /FOREIGN KEY/);
  assert.throws(() => f.store.query('DELETE FROM pets WHERE id=?', f.pet.id), /FOREIGN KEY/);
  f.plan(a.id);
  assert.throws(() => f.store.query("DELETE FROM visit_types WHERE id='type-1'"), /FOREIGN KEY/);
});

for (const problem of ['orphan', 'unknown-field', 'id-mismatch', 'checkpoint-order'] as const) {
  test(`failed legacy migration (${problem}) retains the original schema and records`, (t) => {
    const path = temporaryDatabase(t);
    const f = fixture();
    const a = f.book();
    f.clinic.cases.createCase(f.vets[0], { petId: f.pet.id, name: 'Care', appointmentIds: [a.id] });
    const state = f.store.read();
    f.store.close();
    if (problem === 'orphan') state.pets[0].ownerId = 'missing';
    if (problem === 'unknown-field')
      Object.assign(state.pets[0], { unexpected: 'Must not silently discard' });
    if (problem === 'checkpoint-order') state.cases[0].checkpointIds = [];
    writeLegacyDatabase(path, state);
    const original = new DatabaseSync(path);
    if (problem === 'id-mismatch') original.exec("UPDATE pets SET id='different'");
    const before = original.prepare('SELECT id,document FROM pets').all();
    original.close();
    assert.throws(() => new Store(path), /previous schema and records were preserved/);
    const after = new DatabaseSync(path);
    try {
      assert.equal(after.prepare('PRAGMA user_version').get()!.user_version, 0);
      assert.deepEqual(after.prepare('SELECT id,document FROM pets').all(), before);
      assert.equal(
        after.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().length,
        9,
      );
      for (const table of collections)
        assert.ok(
          after
            .prepare(`PRAGMA table_info(${table})`)
            .all()
            .some((column) => column.name === 'document'),
        );
    } finally {
      after.close();
    }
  });
}

test('future schema versions are rejected without modifying existing data', (t) => {
  const path = temporaryDatabase(t);
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE future (value TEXT); INSERT INTO future VALUES ('Keep me'); PRAGMA user_version=99",
  );
  db.close();
  assert.throws(() => new Store(path), /previous schema and records were preserved/);
  const reopened = new DatabaseSync(path);
  try {
    assert.equal(reopened.prepare('PRAGMA user_version').get()!.user_version, 99);
    assert.equal(reopened.prepare('SELECT value FROM future').get()!.value, 'Keep me');
  } finally {
    reopened.close();
  }
});
