import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

/** Run from apps/app so its .env and relative DATABASE_PATH resolve like the API does. */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const path = resolve(process.env.DATABASE_PATH || 'data/clinic.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  return `file:${path}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl() },
});
