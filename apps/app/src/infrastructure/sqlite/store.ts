import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_VISIT_TYPES } from '@vet-clinic/config';
import type {
  Appointment,
  Case,
  Pet,
  Product,
  StockMovement,
  TimeBlock,
  User,
  VisitType,
} from '@vet-clinic/types';

export interface Account extends User {
  passwordHash: string;
}
export interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}
export interface State {
  users: Account[];
  sessions: Session[];
  pets: Pet[];
  appointments: Appointment[];
  cases: Case[];
  products: Product[];
  movements: StockMovement[];
  visitTypes: VisitType[];
  timeBlocks: TimeBlock[];
}
const collections: (keyof State)[] = [
  'users',
  'sessions',
  'pets',
  'appointments',
  'cases',
  'products',
  'movements',
  'visitTypes',
  'timeBlocks',
];

/** SQLite serializes all read/check/write operations across connections and processes. */
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    for (const collection of collections)
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${collection} (id TEXT PRIMARY KEY, document TEXT NOT NULL CHECK(json_valid(document)));`,
      );
    this.transaction((s) => {
      if (!s.visitTypes.length)
        s.visitTypes = DEFAULT_VISIT_TYPES.map((name, i) => ({
          id: `type-${i + 1}`,
          name,
          retired: false,
        }));
    });
  }
  read(): State {
    const state = Object.fromEntries(collections.map((c) => [c, []])) as unknown as State;
    for (const collection of collections)
      for (const row of this.db.prepare(`SELECT document FROM ${collection} ORDER BY rowid`).all())
        (state[collection] as unknown[]).push(JSON.parse(row.document as string));
    return state;
  }
  transaction<T>(fn: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const state = this.read();
      const before = new Map<string, string>();
      for (const c of collections)
        for (const entity of state[c]) before.set(`${c}/${entity.id}`, JSON.stringify(entity));
      const result = fn(state);
      if (result && typeof result === 'object' && 'then' in result)
        throw new TypeError('Store transactions must be synchronous');
      for (const c of collections) {
        const upsert = this.db.prepare(
          `INSERT INTO ${c}(id,document) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document`,
        );
        for (const entity of state[c]) {
          const key = `${c}/${entity.id}`;
          const json = JSON.stringify(entity);
          if (before.get(key) !== json) upsert.run(entity.id, json);
          before.delete(key);
        }
        const remove = this.db.prepare(`DELETE FROM ${c} WHERE id=?`);
        for (const key of before.keys())
          if (key.startsWith(`${c}/`)) remove.run(key.slice(c.length + 1));
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  query(sql: string, ...parameters: (string | number)[]) {
    return this.db.prepare(sql).all(...parameters);
  }
}
