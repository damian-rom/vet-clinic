import type { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { collections, type State } from './entities';
import { RELATIONAL_SCHEMA, SCHEMA_VERSION } from './schema';
import { emptyState, StateRepository } from './state.repository';

function readLegacyState(db: DatabaseSync): State {
  const state = emptyState();
  for (const collection of collections) {
    const entities = state[collection] as { id: string }[];
    for (const row of db.prepare(`SELECT id, document FROM ${collection} ORDER BY rowid`).all()) {
      const entity: unknown = JSON.parse(row.document as string);
      if (!entity || typeof entity !== 'object' || !('id' in entity) || entity.id !== row.id)
        throw new Error(`Invalid legacy record in ${collection}`);
      entities.push(entity as { id: string });
    }
  }
  return state;
}

/** DDL, data conversion, validation and version changes commit together or all roll back. */
export function migrateDatabase(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = db.prepare('PRAGMA user_version').get()!.user_version as number;
    if (version === SCHEMA_VERSION) {
      db.exec('COMMIT');
      return;
    }
    if (version !== 0) throw new Error(`Unsupported database schema version ${version}`);
    const existing = collections.filter((table) =>
      db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table),
    );
    if (
      existing.length &&
      (existing.length !== collections.length ||
        existing.some(
          (table) =>
            !db
              .prepare(`PRAGMA table_info(${table})`)
              .all()
              .some((column) => column.name === 'document'),
        ))
    )
      throw new Error('Unrecognized database schema; no changes were applied');

    const legacy = existing.length ? readLegacyState(db) : undefined;
    if (legacy) {
      for (const table of collections) db.exec(`ALTER TABLE ${table} RENAME TO legacy_${table}`);
    }
    db.exec(RELATIONAL_SCHEMA);
    if (legacy) {
      const repository = new StateRepository(db);
      repository.synchronize(emptyState(), legacy);
      if (!isDeepStrictEqual(repository.read(), legacy))
        throw new Error('Migration verification failed: an entity field could not be preserved');
      for (const table of collections) db.exec(`DROP TABLE legacy_${table}`);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Migration verification failed: invalid entity relationships');
    db.exec(`PRAGMA user_version=${SCHEMA_VERSION}; COMMIT;`);
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error('Database migration failed; the previous schema and records were preserved.', {
      cause: error,
    });
  }
}
