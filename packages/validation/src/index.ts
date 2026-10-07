import { z } from "zod";

export const registerPetSchema = z.object({
  name: z.string().min(1),
  species: z.enum(["Dog", "Cat", "Rabbit", "Bird", "Other"]),
  sex: z.enum(["Male", "Female"]),
  dateOfBirth: z.string().optional(),
  breed: z.string().optional(),
  weight: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const bookAppointmentSchema = z.object({
  petId: z.string().min(1),
  symptoms: z.string().min(1),
  scheduledAt: z.string().datetime(),
});

export const visitPlanSchema = z.object({
  visitTypeId: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  estimatedActives: z.array(
    z.object({ productId: z.string().min(1), quantity: z.number().positive() })
  ),
});

export const stockMovementSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["Received", "Correction", "Used"]),
  quantity: z.number(),
  reason: z.string().optional(),
  appointmentId: z.string().optional(),
});
