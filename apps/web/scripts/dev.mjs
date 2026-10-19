import { existsSync } from 'node:fs';

// Next picks its port before reading .env files, so load .env.local first to honour PORT (default 3000).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
// A combined local run can give the frontend its own port while the API uses PORT.
if (process.env.WEB_PORT) process.env.PORT = process.env.WEB_PORT;
process.argv.splice(2, 0, 'dev');
await import('next/dist/bin/next');
