import 'dotenv/config';
import { resolve } from 'node:path';
import { Clinic } from './clinic';
import { Store } from './infrastructure/sqlite/store';
import { createServer } from './server';

async function bootstrap() {
  if (!process.env.CLINIC_ACCESS_CODE)
    throw new Error('Set CLINIC_ACCESS_CODE in apps/app/.env before starting the clinic.');
  const store = new Store(resolve(process.env.DATABASE_PATH || 'data/clinic.sqlite'));
  const app = await createServer(new Clinic(store));
  await app.listen(Number(process.env.PORT || 3001), '127.0.0.1');
  console.log(`Clinic API ready on http://localhost:${process.env.PORT || 3001}/api`);
  const close = () => store.close();
  process.once('exit', close);
}

bootstrap().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
