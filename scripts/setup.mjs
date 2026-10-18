import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const apiEnv = resolve('apps/app/.env');
if (!existsSync(apiEnv)) {
  const template = readFileSync(resolve('apps/app/.env.example'), 'utf8');
  writeFileSync(
    apiEnv,
    template.replace('replace-with-a-long-private-code', randomBytes(24).toString('base64url')),
    { flag: 'wx' },
  );
  console.log('Created apps/app/.env with a private clinic registration code.');
} else console.log('Preserved the existing API environment settings.');
const webEnv = resolve('apps/web/.env.local');
if (!existsSync(webEnv))
  writeFileSync(webEnv, readFileSync(resolve('apps/web/.env.example'), 'utf8'), { flag: 'wx' });
console.log('Read CLINIC_ACCESS_CODE in apps/app/.env to register your first veterinarian.');
console.log('Configure AI and SMTP in that file when connecting external providers.');
console.log('Run pnpm dev, then open http://localhost:3000.');
