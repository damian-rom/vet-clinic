import { HttpException } from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Appointment, PlanInput, User } from '@vet-clinic/types';
import type { Repositories } from '../infrastructure/prisma/repositories';

export const fail = (message: string, status = 409): never => {
  throw new HttpException(message, status);
};
export const id = () => randomUUID();
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const active = (a: Appointment) =>
  a.status === 'Confirmed' || a.status === 'AwaitingConfirmation';
export const duration = (a: Appointment) => a.plan?.durationMinutes || 30;
export const requireVet = (u: User) => {
  if (u.role !== 'vet') fail('Veterinarian access required', 403);
};
export const requireOwner = (u: User) => {
  if (u.role !== 'owner') fail('Owner access required', 403);
};
export const required = <T>(record: T | null | undefined): T =>
  record ?? fail('Record not found', 404);
export const isoNow = (now: () => number) => new Date(now()).toISOString();
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
export const sameSecret = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hashToken(a), 'hex'), Buffer.from(hashToken(b), 'hex'));
export async function validatePlan(repos: Repositories, plan: PlanInput, previousType?: string) {
  const type = await repos.visitTypes.get(plan.visitTypeId);
  if (type.retired && type.id !== previousType) fail('Choose an active visit type');
  if (!(await repos.products.allExist(plan.estimatedActives.map((item) => item.productId))))
    fail('Record not found', 404);
}
