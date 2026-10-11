import { z } from 'zod';

const text = (max = 200) => z.string().trim().min(1).max(max);
export const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
export const registrationSchema = loginSchema.extend({
  name: text(100),
  password: z.string().min(10).max(128),
  clinicCode: z.string().max(200).optional(),
});
export const registerPetSchema = z
  .object({
    name: text(100),
    species: z.enum(['Dog', 'Cat', 'Rabbit', 'Bird', 'Other']),
    sex: z.enum(['Male', 'Female']),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    approximateAge: text(100).optional(),
    breed: z.string().trim().max(100).optional(),
    weight: z.number().positive().max(2000).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((p) => Boolean(p.dateOfBirth || p.approximateAge), {
    message: 'Enter a date of birth or approximate age',
    path: ['dateOfBirth'],
  })
  .refine(
    (p) =>
      !p.dateOfBirth ||
      (!Number.isNaN(Date.parse(p.dateOfBirth)) &&
        new Date(p.dateOfBirth).toISOString().slice(0, 10) === p.dateOfBirth &&
        Date.parse(p.dateOfBirth) <= Date.now()),
    { message: 'Date of birth must be a real date in the past', path: ['dateOfBirth'] },
  );
export const bookAppointmentSchema = z
  .object({ petId: text(), symptoms: text(4000), scheduledAt: z.string().datetime() })
  .strict();
export const activeSchema = z
  .object({ productId: text(), quantity: z.number().positive().max(1e8) })
  .strict();
export const activesSchema = z
  .array(activeSchema)
  .max(100)
  .refine(
    (a) => new Set(a.map((v) => v.productId)).size === a.length,
    'List each product only once',
  );
export const visitPlanSchema = z
  .object({
    visitTypeId: text(),
    durationMinutes: z.number().int().min(1).max(540),
    estimatedActives: activesSchema,
  })
  .strict();
export const stockMovementSchema = z
  .object({
    productId: text(),
    type: z.enum(['Received', 'Correction']),
    quantity: z
      .number()
      .finite()
      .min(-1e8)
      .max(1e8)
      .refine((v) => v !== 0, 'Quantity cannot be zero'),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((v) => v.type !== 'Correction' || Boolean(v.reason), {
    message: 'Corrections require a reason',
    path: ['reason'],
  })
  .refine((v) => v.type !== 'Received' || v.quantity > 0, {
    message: 'Received quantity must be positive',
    path: ['quantity'],
  });
export const productSchema = z.object({ name: text(100), unit: text(30) }).strict();
export const caseSchema = z
  .object({ petId: text(), name: text(200), appointmentIds: z.array(text()).max(100).default([]) })
  .strict();
export const checkpointSchema = z
  .object({
    symptoms: text(4000),
    petNeeded: z.boolean(),
    scheduledAt: z.string().datetime().optional(),
    vetId: text().optional(),
  })
  .strict()
  .refine(
    (v) => v.petNeeded || Boolean(v.scheduledAt && v.vetId),
    'A checkpoint without the pet needs a time and veterinarian',
  )
  .refine(
    (v) => !v.petNeeded || (!v.scheduledAt && !v.vetId),
    'The owner chooses the time for a pet-needed checkpoint',
  );
export const timeBlockSchema = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), 'End must be after start');
export const visitTypeSchema = z
  .object({ name: text(100), retired: z.boolean().optional() })
  .strict();

export const emptyRequestSchema = z.object({}).strict();
export const assignVetSchema = z.object({ vetId: text() }).strict();
export const pickTimeSchema = z.object({ scheduledAt: z.string().datetime() }).strict();
export const rescheduleSchema = pickTimeSchema.extend({ revision: z.number().int() });
export const savePlanSchema = visitPlanSchema.extend({ revision: z.number().int() });
export const completeVisitSchema = z
  .object({ actualActives: activesSchema, revision: z.number().int() })
  .strict();
export const draftBatchSchema = z
  .object({ appointmentIds: z.array(text()).min(1).max(30) })
  .strict();
export const attachCheckpointSchema = z.object({ appointmentId: text() }).strict();

/** The browser uses the same contracts as the API before making a request. */
export function requestSchema(path: string, method: string): z.ZodType | undefined {
  if (method === 'GET') return undefined;
  if (method === 'DELETE') return emptyRequestSchema;
  if (path === 'auth/login') return loginSchema;
  if (path === 'auth/register' || path === 'auth/register-vet') return registrationSchema;
  if (path === 'pets' || /^pets\/[^/]+$/.test(path)) return registerPetSchema;
  if (path === 'appointments') return bookAppointmentSchema;
  if (path === 'ai/draft') return draftBatchSchema;
  if (path === 'cases') return caseSchema;
  if (/^cases\/[^/]+\/checkpoints$/.test(path)) return checkpointSchema;
  if (/^cases\/[^/]+\/attach$/.test(path)) return attachCheckpointSchema;
  if (path === 'products') return productSchema;
  if (path === 'movements') return stockMovementSchema;
  if (path === 'visit-types' || /^visit-types\/[^/]+$/.test(path)) return visitTypeSchema;
  if (path === 'time-blocks') return timeBlockSchema;
  const action = /^appointments\/[^/]+\/([^/]+)$/.exec(path)?.[1];
  const actions: Record<string, z.ZodType> = {
    assign: assignVetSchema,
    'pick-time': pickTimeSchema,
    reschedule: rescheduleSchema,
    plan: savePlanSchema,
    complete: completeVisitSchema,
    cancel: emptyRequestSchema,
    'request-time': emptyRequestSchema,
  };
  return action ? actions[action] : undefined;
}
