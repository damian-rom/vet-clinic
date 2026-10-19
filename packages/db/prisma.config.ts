import 'dotenv/config';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { defineConfig } from 'prisma/config';

/** Initialize SQLite's empty header so fresh migrations also work on Windows. */
function prepareDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) return;
  const db = new Database(path);
  try {
    db.pragma('user_version = 0');
  } finally {
    db.close();
  }
}

/** Run from apps/app so its .env and relative DATABASE_PATH resolve like the API does. */
function databaseUrl() {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL;
    if (url.startsWith('file:')) {
      const path = url.startsWith('file://') ? fileURLToPath(url) : url.slice(5);
      if (isAbsolute(path)) prepareDatabase(path);
    }
    return url;
  }
  const path = resolve(process.env.DATABASE_PATH || 'data/clinic.sqlite');
  prepareDatabase(path);
  return `file:${path}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl() },
});
