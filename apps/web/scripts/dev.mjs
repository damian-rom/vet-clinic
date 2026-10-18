import { existsSync } from 'node:fs';

// Next picks its port before reading .env files, so load .env.local first to honour PORT (default 3000).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
process.argv.splice(2, 0, 'dev');
await import('next/dist/bin/next');
