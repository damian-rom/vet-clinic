import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { DEFAULT_VISIT_TYPES } from '@vet-clinic/config';
import { Prisma, PrismaClient } from './generated/client';

export * from './generated/client';
export type Tx = Prisma.TransactionClient;

export const MIGRATIONS_PATH = resolve(__dirname, '../prisma/migrations');
export const PRISMA_CONFIG_PATH = resolve(__dirname, '../prisma.config.ts');

/**
 * One SQLite connection per process. The adapter serializes its transactions, and every
 * service query runs inside one, so reads never observe another request's uncommitted rows.
 */
export class Database {
  readonly client: PrismaClient;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.client = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: path, timeout: 5000 }),
      transactionOptions: { maxWait: 10_000, timeout: 10_000 },
    });
  }

  /** A consistent snapshot across related tables. */
  read<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn);
  }

  /**
   * Checks and writes commit together. The leading no-op write takes SQLite's write lock
   * before anything is read, like BEGIN IMMEDIATE, so competing processes queue instead
   * of deciding from a stale snapshot.
   */
  write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "time_blocks" WHERE 0`;
      return fn(tx);
    });
  }

  close(): Promise<void> {
    return this.client.$disconnect();
  }
}

/** Opens a migrated database; run `pnpm db:migrate` before starting the API. */
export async function openDatabase(path: string): Promise<Database> {
  const db = new Database(path);
  try {
    await db.client.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await db.client.$executeRawUnsafe('PRAGMA foreign_keys=ON');
    const expected = readdirSync(MIGRATIONS_PATH, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const applied = await db.client
      .$queryRawUnsafe<{ migration_name: string }[]>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      )
      .catch(() => []);
    const names = new Set(applied.map((row) => row.migration_name));
    if (expected.some((name) => !names.has(name)))
      throw new Error('The database schema is not up to date. Run pnpm db:migrate first.');
    await db.write(async (tx) => {
      if (await tx.visitType.count()) return;
      await tx.visitType.createMany({
        data: DEFAULT_VISIT_TYPES.map((name, index) => ({
          id: `type-${index + 1}`,
          name,
          retired: false,
        })),
      });
    });
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
