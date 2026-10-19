import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = join(root, 'apps', 'app', 'data', 'presentation.sqlite');
const args = new Set(process.argv.slice(2));
const allowed = new Set(['--fresh', '--seed-only']);
if ([...args].some((argument) => !allowed.has(argument)))
  throw new Error('Usage: pnpm demo [--fresh] [--seed-only]');
if (!process.env.npm_execpath?.toLowerCase().includes('pnpm'))
  throw new Error('Start the presentation with pnpm demo.');

const environment = {
  ...process.env,
  DATABASE_PATH: databasePath,
  DATABASE_URL: 'file:' + databasePath,
  PORT: '3001',
  WEB_PORT: '3000',
  HOST: '127.0.0.1',
  APP_ORIGIN: 'http://localhost:3000',
  API_URL: 'http://127.0.0.1:3001',
  COOKIE_SECURE: 'false',
};
let child;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });

/** Invoke the same pnpm CLI without a shell, including on Windows and paths with spaces. */
function run(arguments_) {
  return new Promise((resolveRun, reject) => {
    const nativePnpm = process.env.npm_execpath.toLowerCase().endsWith('.exe');
    child = spawn(
      nativePnpm ? process.env.npm_execpath : process.execPath,
      nativePnpm ? arguments_ : [process.env.npm_execpath, ...arguments_],
      {
        cwd: root,
        env: environment,
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      child = undefined;
      if (stopping) reject(new Error('Presentation stopped.'));
      else if (code === 0) resolveRun();
      else reject(new Error('Presentation command failed with exit code ' + code + '.'));
    });
  });
}

function requireFreePort(port) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', () =>
      reject(
        new Error('Port ' + port + ' is in use. Stop the existing app, then run pnpm demo again.'),
      ),
    );
    server.listen(port, '127.0.0.1', () => server.close(resolvePort));
  });
}

async function resetPresentation() {
  if (!existsSync(databasePath)) return;
  // These exact files belong only to the presentation; the normal clinic file is never touched.
  const expected = join(root, 'apps', 'app', 'data', 'presentation.sqlite');
  if (databasePath !== expected) throw new Error('Unexpected presentation database path.');
  const snapshot = databasePath.replace(
    '.sqlite',
    '.backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.sqlite',
  );
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try {
    await backup(source, snapshot);
  } finally {
    source.close();
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const target = databasePath + suffix;
    if (existsSync(target)) unlinkSync(target);
  }
  console.log('Saved the previous rehearsal to ' + snapshot);
}

async function main() {
  await Promise.all([requireFreePort(3000), requireFreePort(3001)]);
  if (args.has('--fresh')) await resetPresentation();
  await run(['exec', 'turbo', 'run', 'build', '--filter=@vet-clinic/app']);
  await run(['--filter', '@vet-clinic/app', 'db:migrate']);
  await run(['--filter', '@vet-clinic/app', 'exec', 'tsx', 'src/demo/cli.ts']);
  if (!args.has('--seed-only')) {
    console.log('Opening the presentation app at http://localhost:3000. Press Ctrl+C to stop.');
    // Development tasks are uncached. Loose mode passes the isolated database/proxy settings.
    await run(['exec', 'turbo', 'run', 'dev', '--env-mode=loose']);
  }
}
main().catch((error) => {
  if (!stopping) console.error(error.message);
  process.exitCode = stopping ? 0 : 1;
});
