import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { openDatabase, PRISMA_CONFIG_PATH, type Database } from '@vet-clinic/db';
import type { PlanInput, User } from '@vet-clinic/types';
import type { PlanningPort } from '../src/domain/ports/planning.port';

import type { EmailPort, ReportEmail } from '../src/domain/ports/email.port';

import { Clinic } from '../src/clinic';
import {
  appointmentInclude,
  appointmentOrder,
  caseInclude,
  toAppointment,
  toCase,
  toMovement,
  toPet,
  toTimeBlock,
} from '../src/infrastructure/prisma/records';

export const DAY = '2030-01-07'; // Monday, winter offset in Havana.
export const TIME = '2030-01-07T14:00:00.000Z'; // 09:00 at the clinic.
export const CODE = 'test-clinic-access-code';
export const PASSWORD = 'correct-horse-battery';
export class FakePlanningAdapter implements PlanningPort {
  readonly available = true;
  plan: PlanInput = { visitTypeId: 'type-1', durationMinutes: 30, estimatedActives: [] };
  draft = async () => structuredClone(this.plan);
}
export class FakeEmailAdapter implements EmailPort {
  readonly available = true;
  messages: ReportEmail[] = [];
  async sendReport(message: ReportEmail) {
    this.messages.push(message);
  }
}

/** A temporary directory removed when the test process exits. */
export function temporaryDirectory(prefix = 'vet-clinic-'): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  process.once('exit', () => {
    const target = resolve(directory);
    if (target.startsWith(resolve(tmpdir()) + sep))
      rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return directory;
}

let template: string | undefined;
/** Applies the real Prisma migrations once per test process, then copies the result. */
export function migrateDatabase(path: string): void {
  if (!template) {
    template = join(temporaryDirectory('vet-template-'), 'clinic.sqlite');
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        '--config',
        PRISMA_CONFIG_PATH,
      ],
      { env: { ...process.env, DATABASE_URL: `file:${template}` }, stdio: 'ignore' },
    );
  }
  if (!existsSync(path)) copyFileSync(template, path);
}

export async function testDatabase(path?: string): Promise<Database> {
  const target = path || join(temporaryDirectory(), 'clinic.sqlite');
  migrateDatabase(target);
  return openDatabase(target);
}

/** Every persisted record in domain form, for assertions about stored data. */
export function readState(db: Database) {
  const byId = { orderBy: { id: 'asc' } } as const;
  return db.read(async (tx) => ({
    users: await tx.user.findMany(byId),
    sessions: (await tx.session.findMany(byId)).map((session) => ({
      ...session,
      expiresAt: Number(session.expiresAt),
    })),
    pets: (await tx.pet.findMany(byId)).map(toPet),
    appointments: (
      await tx.appointment.findMany({ include: appointmentInclude, orderBy: appointmentOrder })
    ).map(toAppointment),
    cases: (await tx.case.findMany({ include: caseInclude, ...byId })).map(toCase),
    products: await tx.product.findMany(byId),
    movements: (await tx.movement.findMany(byId)).map(toMovement),
    visitTypes: await tx.visitType.findMany(byId),
    timeBlocks: (await tx.timeBlock.findMany(byId)).map(toTimeBlock),
  }));
}

export async function fixture(options: { path?: string; vets?: number } = {}) {
  process.env.CLINIC_ACCESS_CODE = CODE;
  const db = await testDatabase(options.path);
  const clock = { value: Date.parse('2030-01-07T12:00:00Z') };
  const ai = new FakePlanningAdapter();
  const email = new FakeEmailAdapter();
  const clinic = new Clinic(db, ai, () => clock.value, 'America/Havana', email);
  const vets: User[] = [];
  for (let i = 0; i < (options.vets ?? 2); i++)
    vets.push(
      (
        await clinic.auth.register(
          { name: `Vet ${i}`, email: `vet${i}@example.com`, password: PASSWORD, clinicCode: CODE },
          true,
        )
      ).user,
    );
  const owner = (
    await clinic.auth.register({
      name: 'Owner',
      email: 'owner@example.com',
      password: PASSWORD,
    })
  ).user;
  const pet = await clinic.pets.pet(owner, {
    name: 'Luna',
    species: 'Cat',
    sex: 'Female',
    approximateAge: '3 years',
  });
  const book = (scheduledAt = TIME) =>
    clinic.appointments.book(owner, { petId: pet.id, symptoms: 'Limping', scheduledAt });
  const appointment = async (id: string) =>
    toAppointment(
      (await db.read((tx) =>
        tx.appointment.findUnique({ where: { id }, include: appointmentInclude }),
      ))!,
    );
  const plan = async (
    id: string,
    estimatedActives: PlanInput['estimatedActives'] = [],
    durationMinutes = 30,
  ) =>
    clinic.appointments.appointment(vets[0], id, 'plan', {
      visitTypeId: 'type-1',
      durationMinutes,
      estimatedActives,
      revision: (await appointment(id)).revision,
    });
  return { db, clock, ai, email, clinic, vets, owner, pet, book, appointment, plan };
}
