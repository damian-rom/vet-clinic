import 'dotenv/config';
import { resolve } from 'node:path';
import { openDatabase } from '@vet-clinic/db';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from './seed';
import { localParts } from '../time';

async function main() {
  const path = resolve(process.env.DATABASE_PATH || 'data/clinic.sqlite');
  if (path !== resolve('data/presentation.sqlite') && path !== '/data/presentation.sqlite')
    throw new Error(
      'The presentation seed only opens data/presentation.sqlite locally or /data/presentation.sqlite in Docker.',
    );
  const timezone = process.env.CLINIC_TIMEZONE || 'America/Havana';
  const db = await openDatabase(path);
  try {
    const created = await seedDemo(db, {
      timezone,
      ownerEmail: process.env.DEMO_OWNER_EMAIL?.trim() || undefined,
    });
    const accounts = await db.read((tx) =>
      tx.user.findMany({
        where: { id: { in: Object.values(DEMO_ACCOUNTS).map((account) => account.id) } },
        select: { name: true, email: true, role: true },
        orderBy: { role: 'desc' },
      }),
    );
    const firstVisit = await db.read((tx) =>
      tx.appointment.findUnique({ where: { id: 'demo-visit-luna-booking' } }),
    );
    console.log(
      created
        ? 'Created presentation data.'
        : 'Reusing presentation data and preserving your rehearsal changes.',
    );
    console.log('Database: ' + path);
    console.table(accounts);
    console.log('Demo password for all four accounts: ' + DEMO_PASSWORD);
    if (
      accounts.find((account) => account.name === DEMO_ACCOUNTS.sofia.name)?.email.endsWith('.test')
    )
      console.log(
        'Sample .test addresses cannot receive mail. Set DEMO_OWNER_EMAIL in apps/app/.env before creating fresh presentation data to give Sofia a real recipient address.',
      );
    if (firstVisit?.scheduledAt)
      console.log(
        'First demonstration day: ' +
          localParts(firstVisit.scheduledAt, timezone).date +
          ' (' +
          timezone +
          ').',
      );
    console.log('See docs/presentation.md for resetting the presentation with new dates.');
    console.log('Live AI and email use apps/app/.env. Seeding does not call either provider.');
  } finally {
    await db.close();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not prepare presentation data.');
  process.exitCode = 1;
});
