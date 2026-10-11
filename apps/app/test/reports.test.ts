import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcpServer } from 'node:net';
import { SmtpEmailAdapter } from '../src/infrastructure/email/smtp.adapter';
import { CompatibleAiAdapter } from '../src/infrastructure/ai/chat-completions.adapter';
import { fixture, TIME } from './helpers';

test('three joined-data reports, role boundaries, PDF generation and account-only delivery', async (t) => {
  const f = fixture();
  t.after(() => f.store.close());
  const a = f.book();
  f.plan(a.id);
  const p = f.clinic.inventory.createProduct(f.vets[0], { name: 'Vaccine', unit: 'dose' });
  f.clinic.inventory.movement(f.vets[0], { productId: p.id, type: 'Received', quantity: 3 });
  const filters = { from: '2030-01-01', to: '2030-12-31', language: 'es' };
  for (const kind of ['care-history', 'clinic-activity', 'inventory-usage']) {
    const report = f.clinic.reports.build(f.vets[0], kind, filters);
    assert.equal(report.rows.length, 1);
    const pdf = await f.clinic.reports.pdf(report);
    assert.ok(pdf.length > 1000);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  }
  const own = f.clinic.reports.build(f.owner, 'care-history', filters);
  assert.equal(own.columns.length, 5);
  assert.ok(!JSON.stringify(own).includes('type-1'));
  assert.throws(() => f.clinic.reports.build(f.owner, 'inventory-usage', filters));
  assert.throws(() =>
    f.clinic.reports.build(f.owner, 'care-history', { ...filters, from: '2030-02-30' }),
  );
  await f.clinic.reports.emailReport(f.owner, 'care-history', filters);
  assert.equal(f.email.messages[0].to, f.owner.email);
  await assert.rejects(() =>
    f.clinic.reports.emailReport(f.owner, 'care-history', {
      ...filters,
      toEmail: 'attacker@example.com',
    }),
  );
  assert.equal(
    f.clinic.reports.build(f.owner, 'care-history', {
      ...filters,
      from: '2031-01-01',
      to: '2031-12-31',
    }).rows.length,
    0,
  );
  assert.ok(f.appointment(a.id).scheduledAt === TIME);
});

test('SMTP adapter sends an attached PDF through a real local SMTP connection', async (t) => {
  let delivered = '';
  let resolveDelivery: () => void = () => {};
  const delivery = new Promise<void>((resolve) => {
    resolveDelivery = resolve;
  });
  const server = createTcpServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '';
    let data = false;
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (data) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end >= 0) {
          delivered = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          data = false;
          socket.write('250 queued\r\n');
          resolveDelivery();
        } else return;
      }
      while (buffer.includes('\r\n')) {
        const end = buffer.indexOf('\r\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (line.startsWith('EHLO') || line.startsWith('HELO')) socket.write('250 localhost\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 send message\r\n');
          break;
        } else if (line === 'QUIT') {
          socket.end('221 bye\r\n');
        } else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const old = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_SECURE: process.env.SMTP_SECURE,
  };
  Object.assign(process.env, {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(address.port),
    SMTP_FROM: 'clinic@example.com',
    SMTP_SECURE: 'false',
  });
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  await new SmtpEmailAdapter().sendReport({
    to: 'owner@example.com',
    subject: 'Care history',
    filename: 'care.pdf',
    pdf: Buffer.from('%PDF-1.4\nTest report'),
  });
  await delivery;
  assert.match(delivered, /application\/pdf/);
  assert.match(delivered, /care\.pdf/);
  assert.match(delivered, /owner@example.com/);
});

test('real AI adapter is explicit when unconfigured', async () => {
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  try {
    const adapter = new CompatibleAiAdapter();
    assert.equal(adapter.available, false);
    await assert.rejects(
      () =>
        adapter.draft({
          pet: {
            id: 'pet',
            ownerId: 'owner',
            name: 'Luna',
            species: 'Cat',
            sex: 'Female',
            approximateAge: '3 years',
          },
          symptoms: 'Limping',
          products: [],
          visitTypes: [],
        }),
      /not configured/,
    );
  } finally {
    if (key !== undefined) process.env.AI_API_KEY = key;
    if (model !== undefined) process.env.AI_MODEL = model;
  }
});
