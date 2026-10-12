import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_VISIT_TYPES } from '@vet-clinic/config';
import type { State } from './entities';
import { migrateDatabase } from './migrations';
import { StateRepository } from './state.repository';

export type { Account, Session, State } from './entities';

/** SQLite serializes all read/check/write operations across connections and processes. */
export class Store {
  private readonly db: DatabaseSync;
  private readonly repository: StateRepository;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
      migrateDatabase(this.db);
      this.repository = new StateRepository(this.db);
      this.transaction((state) => {
        if (!state.visitTypes.length)
          state.visitTypes = DEFAULT_VISIT_TYPES.map((name, index) => ({
            id: `type-${index + 1}`,
            name,
            retired: false,
          }));
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  read(): State {
    if (this.db.isTransaction) return this.repository.read();
    // A consistent snapshot prevents reading half of another connection's multi-table write.
    this.db.exec('BEGIN');
    try {
      const state = this.repository.read();
      this.db.exec('COMMIT');
      return state;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  transaction<T>(fn: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const before = this.repository.read();
      const state = structuredClone(before);
      const result = fn(state);
      if (result && typeof result === 'object' && 'then' in result)
        throw new TypeError('Store transactions must be synchronous');
      this.repository.synchronize(before, state);
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }

  query(sql: string, ...parameters: (string | number)[]) {
    return this.db.prepare(sql).all(...parameters);
  }
}
