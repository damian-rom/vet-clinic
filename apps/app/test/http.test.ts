import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { OwnerWorkspace } from '@vet-clinic/types';
import { createServer } from '../src/server';
import { fixture, PASSWORD, TIME, DAY, CODE } from './helpers';

test('HTTP authentication, cookies, access controls, booking, cases, reports and JSON validation', async (t) => {
  const f = fixture();
  const app = await createServer(f.clinic);
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    f.store.close();
  });
  const base = await app.getUrl();
  const request = (
    path: string,
    body?: unknown,
    cookie = '',
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const anonymous = await request('workspace');
  assert.equal(anonymous.status, 401);
  const health = await request('health');
  assert.equal(health.status, 200);
  const ownerLogin = await request('auth/login', {
    email: 'owner@example.com',
    password: PASSWORD,
  });
  assert.equal(ownerLogin.status, 201);
  const ownerCookie = ownerLogin.headers.get('set-cookie')!;
  assert.ok(ownerCookie.includes('HttpOnly') && ownerCookie.includes('SameSite=Lax'));
  assert.ok(!JSON.stringify(await ownerLogin.json()).includes('password'));
  const vetLogin = await request('auth/login', { email: 'vet0@example.com', password: PASSWORD });
  const vetCookie = vetLogin.headers.get('set-cookie')!;
  const badStaff = await request('auth/register-vet', {
    name: 'Bad',
    email: 'bad@example.com',
    password: PASSWORD,
    clinicCode: 'wrong',
  });
  assert.equal(badStaff.status, 403);
  const registered = await request('auth/register', {
    name: 'New owner',
    email: 'new@example.com',
    password: PASSWORD,
  });
  assert.equal(registered.status, 201);
  const createdVet = await request('auth/register-vet', {
    name: 'Third',
    email: 'third@example.com',
    password: PASSWORD,
    clinicCode: CODE,
  });
  assert.equal(createdVet.status, 201);
  const wrongOrigin = await request('products', { name: 'x', unit: 'ml' }, vetCookie, {
    Origin: 'https://attacker.example',
  });
  assert.equal(wrongOrigin.status, 403);
  const formAttack = await fetch(`${base}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', Cookie: ownerCookie },
    body: '{}',
  });
  assert.equal(formAttack.status, 415);
  const ownerInternal = await request('products', { name: 'x', unit: 'ml' }, ownerCookie);
  assert.equal(ownerInternal.status, 403);
  const invalidPet = await request(
    'pets',
    { name: 'No age', species: 'Cat', sex: 'Female' },
    ownerCookie,
  );
  assert.equal(invalidPet.status, 400);
  assert.match(z.object({ message: z.string() }).parse(await invalidPet.json()).message, /age/i);
  const slots = await request(`slots?date=${DAY}`, undefined, ownerCookie);
  assert.equal(slots.status, 200);
  assert.equal(z.object({ slots: z.array(z.string()) }).parse(await slots.json()).slots.length, 18);
  const booking = await request(
    'appointments',
    { petId: f.pet.id, symptoms: 'Limp', scheduledAt: TIME },
    ownerCookie,
  );
  assert.equal(booking.status, 201);
  const { id } = z.object({ id: z.string() }).parse(await booking.json());
  const plan = await request(
    `appointments/${id}/plan`,
    { visitTypeId: 'type-1', durationMinutes: 30, estimatedActives: [], revision: 0 },
    vetCookie,
  );
  assert.equal(plan.status, 201);
  const ownerState = await request('workspace', undefined, ownerCookie);
  const state = (await ownerState.json()) as OwnerWorkspace;
  assert.ok(!('plan' in state.appointments[0]));
  assert.ok(!('timeBlocks' in state));
  const forbiddenAI = await request('ai/draft', { appointmentIds: [id] }, ownerCookie);
  assert.equal(forbiddenAI.status, 403);
  const assigned = await request(`appointments/${id}/assign`, { vetId: f.vets[0].id }, vetCookie);
  assert.equal(assigned.status, 201);
  const careCase = await request(
    'cases',
    { petId: f.pet.id, name: 'Follow-up', appointmentIds: [id] },
    vetCookie,
  );
  assert.equal(careCase.status, 201);
  const c = z.object({ id: z.string() }).parse(await careCase.json());
  const checkpoint = await request(
    `cases/${c.id}/checkpoints`,
    { symptoms: 'Recheck', petNeeded: true },
    vetCookie,
  );
  assert.equal(checkpoint.status, 201);
  const ownerCancel = await request(`appointments/${id}/cancel`, {}, ownerCookie);
  assert.equal(ownerCancel.status, 409);
  const ownerReport = await request(
    'reports/care-history?from=2030-01-01&to=2030-12-31',
    undefined,
    ownerCookie,
  );
  assert.equal(ownerReport.status, 200);
  assert.equal(
    z.object({ rows: z.array(z.array(z.string())) }).parse(await ownerReport.json()).rows.length,
    2,
  );
  const forbiddenReport = await request(
    'reports/clinic-activity?from=2030-01-01&to=2030-12-31',
    undefined,
    ownerCookie,
  );
  assert.equal(forbiddenReport.status, 403);
  const pdf = await request(
    'reports/care-history?from=2030-01-01&to=2030-12-31&format=pdf',
    undefined,
    ownerCookie,
  );
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .equals(Buffer.from('%PDF-')),
  );
  const emailed = await request(
    'reports/care-history/email',
    { from: '2030-01-01', to: '2030-12-31' },
    ownerCookie,
  );
  assert.equal(emailed.status, 201);
  assert.equal(f.email.messages[0].to, f.owner.email);
  const unknown = await request('not-a-route', undefined, vetCookie);
  assert.equal(unknown.status, 404);
  const logout = await request('auth/logout', {}, ownerCookie);
  assert.equal(logout.status, 201);
  assert.ok(logout.headers.get('set-cookie')!.includes('Max-Age=0'));
  assert.equal((await request('workspace', undefined, ownerCookie)).status, 401);
});

test('HTTP simultaneous bookings accept exactly available capacity', async (t) => {
  const f = fixture({ vets: 1 });
  const app = await createServer(f.clinic);
  await app.listen(0, '127.0.0.1');
  t.after(async () => {
    await app.close();
    f.store.close();
  });
  const base = await app.getUrl();
  const login = f.clinic.auth.login({ email: 'owner@example.com', password: PASSWORD });
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      fetch(`${base}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `vet_session=${login.token}` },
        body: JSON.stringify({ petId: f.pet.id, symptoms: 'Race', scheduledAt: TIME }),
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 7);
});
