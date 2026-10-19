import type { Database } from '@vet-clinic/db';
import type { Appointment, EstimatedActive, VisitPlan } from '@vet-clinic/types';
import { z } from 'zod';
import { passwordHash } from '../domain/rules';
import { AppointmentsRepository } from '../infrastructure/prisma/repositories/appointments.repository';
import { clinicInstant, localParts } from '../time';

export const DEMO_PASSWORD = 'Pawstead-Demo-2026!';
export const DEMO_ACCOUNTS = {
  ana: { id: 'demo-vet-ana', name: 'Ana Hernandez', email: 'ana@pawstead.test', role: 'vet' },
  mateo: {
    id: 'demo-vet-mateo',
    name: 'Mateo Ruiz',
    email: 'mateo@pawstead.test',
    role: 'vet',
  },
  sofia: {
    id: 'demo-owner-sofia',
    name: 'Sofia Perez',
    email: 'sofia@pawstead.test',
    role: 'owner',
  },
  daniel: {
    id: 'demo-owner-daniel',
    name: 'Daniel Torres',
    email: 'daniel@pawstead.test',
    role: 'owner',
  },
} as const;

const productIds = {
  vaccine: 'demo-product-vaccine',
  lab: 'demo-product-lab',
  suture: 'demo-product-suture',
  gloves: 'demo-product-gloves',
  dressing: 'demo-product-dressing',
} as const;
const dayAfter = (date: string, days: number) =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * 86400_000).toISOString().slice(0, 10);

/** The next or previous weekday, always at least one day away. */
function workingDay(date: string, direction: 1 | -1): string {
  let result = dayAfter(date, direction);
  while ([0, 6].includes(new Date(result + 'T12:00:00Z').getUTCDay()))
    result = dayAfter(result, direction);
  return result;
}

export interface DemoOptions {
  now?: number;
  timezone?: string;
  ownerEmail?: string;
}

/** Inserts one complete dataset atomically. Re-running preserves edits and never duplicates it. */
export async function seedDemo(db: Database, options: DemoOptions = {}): Promise<boolean> {
  const now = options.now ?? Date.now();
  const timezone = options.timezone || 'America/Havana';
  const today = localParts(new Date(now).toISOString(), timezone).date;
  const firstDay = workingDay(today, 1);
  const secondDay = workingDay(firstDay, 1);
  const pastDay = workingDay(today, -1);
  const recentDay = workingDay(dayAfter(today, -6), -1);
  const oldDay = workingDay(dayAfter(today, -44), -1);
  const at = (date: string, hour: number, minute = 0) =>
    clinicInstant(date, hour, minute, timezone);
  const createdAt = new Date(now).toISOString();
  const ownerEmail = z
    .string()
    .email()
    .transform((email) => email.toLowerCase())
    .parse(options.ownerEmail || DEMO_ACCOUNTS.sofia.email);
  const accounts = Object.values(DEMO_ACCOUNTS).map((account) => ({
    ...account,
    email: account.id === DEMO_ACCOUNTS.sofia.id ? ownerEmail : account.email,
    passwordHash: passwordHash(DEMO_PASSWORD),
  }));
  const active = (productId: string, quantity = 1): EstimatedActive => ({ productId, quantity });
  const plan = (
    visitTypeId: string,
    scheduledAt: string,
    estimatedActives: EstimatedActive[] = [],
    durationMinutes = 30,
  ): VisitPlan => ({
    visitTypeId,
    durationMinutes,
    estimatedActives,
    source: 'human',
    reviewedBy: DEMO_ACCOUNTS.ana.id,
    savedAt: new Date(Math.min(now, Date.parse(scheduledAt) - 3600_000)).toISOString(),
  });
  const visit = (
    id: string,
    petId: string,
    ownerId: string,
    symptoms: string,
    fields: Partial<Appointment>,
  ): Appointment => ({
    id: 'demo-visit-' + id,
    petId: 'demo-pet-' + petId,
    ownerId,
    symptoms,
    status: 'Confirmed',
    revision: 0,
    createdAt,
    ...fields,
  });
  const a = DEMO_ACCOUNTS.ana.id;
  const m = DEMO_ACCOUNTS.mateo.id;
  const s = DEMO_ACCOUNTS.sofia.id;
  const d = DEMO_ACCOUNTS.daniel.id;
  const skinExamAt = at(pastDay, 9);
  const boosterAt = at(pastDay, 14);
  const vaccinationAt = at(recentDay, 10);
  const oldPanelAt = at(oldDay, 11);
  const draftAt = at(firstDay, 15);
  const draft = plan('type-3', draftAt, [active(productIds.lab)]);
  draft.source = 'ai-draft';
  delete draft.reviewedBy;
  draft.originalDraft = {
    visitTypeId: 'type-3',
    durationMinutes: 30,
    estimatedActives: [active(productIds.lab)],
  };
  const reviewed = plan('type-3', oldPanelAt, [active(productIds.lab)], 45);
  reviewed.source = 'ai-reviewed';
  reviewed.originalDraft = {
    visitTypeId: 'type-3',
    durationMinutes: 30,
    estimatedActives: [active(productIds.lab)],
  };
  const visits: Appointment[] = [
    visit('luna-booking', 'luna', s, 'Luna skin review — assign me', {
      status: 'AwaitingConfirmation',
      scheduledAt: at(firstDay, 9),
    }),
    visit('nala-consult', 'nala', d, 'Nala wellness consultation', {
      vetId: m,
      scheduledAt: at(firstDay, 9),
      plan: plan('type-1', at(firstDay, 9), [], 60),
    }),
    visit('max-mobility', 'max', s, 'Max mobility review — move me on the calendar', {
      vetId: a,
      scheduledAt: at(firstDay, 10, 30),
      plan: plan('type-1', at(firstDay, 10, 30), [active(productIds.gloves, 2)], 60),
    }),
    visit('milo-ai', 'milo', d, 'Milo ear irritation — draft a plan with AI', {
      status: 'AwaitingConfirmation',
      scheduledAt: at(firstDay, 13, 30),
    }),
    visit('nala-dressing', 'nala', d, 'Nala dressing change — forecast stock shortfall', {
      vetId: m,
      scheduledAt: at(firstDay, 14),
      plan: plan('type-2', at(firstDay, 14), [active(productIds.dressing, 3)]),
    }),
    visit('luna-draft', 'luna', s, 'Luna blood panel — review the sample AI draft', {
      vetId: a,
      scheduledAt: draftAt,
      plan: draft,
    }),
    visit('luna-results', 'luna', s, 'Luna lab results — checkpoint without the pet', {
      vetId: m,
      scheduledAt: at(secondDay, 15),
      caseId: 'demo-case-luna',
      checkpointOrder: 3,
      petNeeded: false,
      plan: plan('type-1', at(secondDay, 15)),
    }),
    visit('max-cancelled', 'max', s, 'Max routine check — cancelled history', {
      status: 'Cancelled',
      scheduledAt: at(firstDay, 15, 30),
    }),
    visit('luna-ready', 'luna', s, 'Luna booster — ready to complete', {
      vetId: a,
      scheduledAt: boosterAt,
      createdAt: at(pastDay, 8),
      plan: plan('type-4', boosterAt, [active(productIds.vaccine)]),
    }),
    visit('luna-skin', 'luna', s, 'Luna initial skin exam — case history', {
      status: 'Done',
      vetId: a,
      scheduledAt: skinExamAt,
      createdAt: at(pastDay, 8),
      completedAt: at(pastDay, 9, 30),
      caseId: 'demo-case-luna',
      checkpointOrder: 1,
      petNeeded: true,
      plan: plan('type-1', skinExamAt, [active(productIds.gloves)]),
      actualActives: [active(productIds.gloves)],
    }),
    visit('luna-followup', 'luna', s, 'Luna follow-up — owner must choose a time', {
      status: 'NeedsTime',
      caseId: 'demo-case-luna',
      checkpointOrder: 2,
      petNeeded: true,
      plan: plan('type-3', createdAt, [active(productIds.lab)]),
    }),
    visit('max-vaccinated', 'max', s, 'Max annual vaccination — completed history', {
      status: 'Done',
      vetId: m,
      scheduledAt: vaccinationAt,
      createdAt: at(recentDay, 8),
      completedAt: at(recentDay, 10, 30),
      plan: plan('type-4', vaccinationAt, [active(productIds.vaccine)]),
      actualActives: [active(productIds.vaccine)],
    }),
    visit('milo-history', 'milo', d, 'Milo blood panel — older retained history', {
      status: 'Done',
      vetId: a,
      scheduledAt: oldPanelAt,
      createdAt: at(oldDay, 8),
      completedAt: at(oldDay, 12),
      plan: reviewed,
      actualActives: [active(productIds.lab)],
    }),
  ];

  return db.write(async (tx) => {
    if (await tx.user.findUnique({ where: { id: a } })) return false;
    // Fixed IDs and one transaction make concurrent starts and interrupted runs safe.
    await tx.user.createMany({ data: accounts });
    await tx.pet.createMany({
      data: [
        {
          id: 'demo-pet-luna',
          ownerId: s,
          name: 'Luna',
          species: 'Cat',
          sex: 'Female',
          breed: 'Siamese',
          approximateAge: '3 years',
          weight: 4.2,
          notes: 'Skin recovery case. Handle gently.',
        },
        {
          id: 'demo-pet-max',
          ownerId: s,
          name: 'Max',
          species: 'Dog',
          sex: 'Male',
          breed: 'Labrador',
          approximateAge: '7 years',
          weight: 28,
          notes: 'Mobility review and vaccination history.',
        },
        {
          id: 'demo-pet-milo',
          ownerId: d,
          name: 'Milo',
          species: 'Cat',
          sex: 'Male',
          approximateAge: '2 years',
          weight: 5,
        },
        {
          id: 'demo-pet-nala',
          ownerId: d,
          name: 'Nala',
          species: 'Dog',
          sex: 'Female',
          approximateAge: '5 years',
          weight: 16,
        },
      ],
    });
    const products = [
      { id: productIds.vaccine, name: 'Vaccine', unit: 'dose', received: 20, used: 1 },
      { id: productIds.lab, name: 'Lab kit', unit: 'kit', received: 10, used: 1 },
      { id: productIds.suture, name: 'Suture', unit: 'kit', received: 15, used: 0 },
      { id: productIds.gloves, name: 'Surgical gloves', unit: 'pair', received: 30, used: 3 },
      { id: productIds.dressing, name: 'Specialty dressing', unit: 'pack', received: 1, used: 0 },
    ];
    await tx.product.createMany({
      data: products.map(({ received, used, ...product }) => ({
        ...product,
        stock: received - used,
      })),
    });
    await tx.case.create({
      data: {
        id: 'demo-case-luna',
        petId: 'demo-pet-luna',
        name: 'Luna skin recovery',
        createdAt: at(pastDay, 8),
      },
    });
    const appointments = new AppointmentsRepository(tx);
    for (const appointment of visits) await appointments.create(appointment);
    await tx.movement.createMany({
      data: [
        ...products.map((product) => ({
          id: 'demo-received-' + product.id,
          productId: product.id,
          type: 'Received' as const,
          quantity: product.received,
          performedBy: a,
          performedAt: at(dayAfter(oldDay, -1), 9),
          reason: 'Presentation opening stock',
        })),
        {
          id: 'demo-correction-gloves',
          productId: productIds.gloves,
          type: 'Correction',
          quantity: -2,
          reason: 'Damaged packaging found during shelf count',
          performedBy: a,
          performedAt: at(pastDay, 8),
        },
        ...visits.flatMap((appointment) =>
          (appointment.actualActives || []).map((item) => ({
            id: 'demo-used-' + appointment.id + '-' + item.productId,
            productId: item.productId,
            type: 'Used' as const,
            quantity: -item.quantity,
            performedBy: appointment.vetId!,
            performedAt: appointment.completedAt!,
            appointmentId: appointment.id,
          })),
        ),
      ],
    });
    await tx.timeBlock.create({
      data: {
        id: 'demo-block-meeting',
        startsAt: at(firstDay, 16),
        endsAt: at(firstDay, 16, 30),
        reason: 'Clinic staff meeting',
      },
    });
    await tx.weeklyTimeBlock.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        id: 'demo-lunch-' + weekday,
        weekday,
        startTime: '12:00',
        endTime: '13:00',
        reason: 'Team lunch',
      })),
    });
    return true;
  });
}
