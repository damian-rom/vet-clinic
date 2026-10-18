import PDFDocument from 'pdfkit';
import { z } from 'zod';
import type { User } from '@vet-clinic/types';
import { fail, requireVet } from '../domain/rules';
import type { Store } from '../infrastructure/prisma/repositories';
import type { EmailPort } from '../domain/ports/email.port';
import { SmtpEmailAdapter } from '../infrastructure/email/smtp.adapter';

export const reportKindSchema = z.enum(['care-history', 'clinic-activity', 'inventory-usage']);
export type ReportKind = z.infer<typeof reportKindSchema>;
export const reportFiltersSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    petId: z.string().min(1).optional(),
    language: z.enum(['en', 'es']).default('en'),
  })
  .strict()
  .refine((v) => v.from <= v.to, 'Start must not be after end')
  .refine(
    (v) =>
      [v.from, v.to].every(
        (d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d,
      ),
    'Use real calendar dates',
  );
export interface ClinicReport {
  kind: ReportKind;
  title: string;
  columns: string[];
  rows: string[][];
  from: string;
  to: string;
  language: 'en' | 'es';
}

/** The day after a YYYY-MM-DD date, as an exclusive upper bound for stored ISO instants. */
const nextDay = (date: string) => new Date(Date.parse(date) + 86400_000).toISOString().slice(0, 10);

/** Reports read related tables through repository queries, never caller-supplied SQL. */
export class ReportsService {
  constructor(
    private readonly store: Store,
    readonly email: EmailPort = new SmtpEmailAdapter(),
  ) {}

  async build(user: User, kindInput: unknown, input: unknown): Promise<ClinicReport> {
    const kind = reportKindSchema.parse(kindInput);
    const filters = reportFiltersSchema.parse(input);
    const spanish = filters.language === 'es';
    if (kind !== 'care-history') requireVet(user);
    const range = { gte: filters.from, lt: nextDay(filters.to) };
    return this.store.read(async (repos) => {
      if (filters.petId) {
        const pet = await repos.pets.get(filters.petId);
        if (user.role === 'owner' && pet.ownerId !== user.id) fail('Record not found', 404);
      }
      // Owner rows deliberately exclude visit plans, actives and AI provenance.
      if (kind === 'care-history' || kind === 'clinic-activity') {
        const appointments = await repos.appointments.forReport(range, {
          ownerId: user.role === 'owner' ? user.id : undefined,
          petId: filters.petId,
        });
        const day = (a: (typeof appointments)[number]) => a.scheduledAt ?? a.createdAt;
        const rows = appointments
          .sort((a, b) => (day(a) < day(b) ? -1 : day(a) > day(b) ? 1 : 0))
          .map((a) => {
            const values = [
              a.pet.name,
              a.owner.name,
              a.scheduledAt ?? (spanish ? 'Sin hora' : 'No time'),
              a.status,
              a.vet?.name ?? '—',
            ];
            if (kind === 'clinic-activity')
              values.push(a.plan?.visitType.name ?? '—', String(a.plan?.durationMinutes ?? 30));
            return values;
          });
        const columns = spanish
          ? ['Mascota', 'Dueño', 'Fecha (UTC)', 'Estado', 'Veterinario']
          : ['Pet', 'Owner', 'Date (UTC)', 'Status', 'Veterinarian'];
        if (kind === 'clinic-activity')
          columns.push(...(spanish ? ['Tipo de visita', 'Minutos'] : ['Visit type', 'Minutes']));
        return {
          kind,
          title:
            kind === 'care-history'
              ? spanish
                ? 'Historial de cuidados'
                : 'Care history'
              : spanish
                ? 'Actividad de la clínica'
                : 'Clinic activity',
          columns,
          rows,
          ...filters,
        };
      }
      const movements = await repos.movements.forReport(range, filters.petId);
      return {
        kind,
        title: spanish ? 'Movimientos de inventario' : 'Inventory usage',
        columns: spanish
          ? ['Fecha (UTC)', 'Producto', 'Movimiento', 'Cantidad', 'Veterinario', 'Motivo / visita']
          : ['Date (UTC)', 'Product', 'Movement', 'Quantity', 'Veterinarian', 'Reason / visit'],
        rows: movements.map((m) => [
          m.performedAt,
          m.product.name,
          m.type,
          `${m.quantity} ${m.product.unit}`,
          m.performer.name,
          m.reason || m.appointmentId || '—',
        ]),
        ...filters,
      };
    });
  }

  async pdf(report: ClinicReport): Promise<Buffer> {
    const document = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: { Title: report.title, Author: 'Pawstead Veterinary Clinic' },
    });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });
    document.fontSize(23).fillColor('#23674e').text('Pawstead');
    document.moveDown().fontSize(18).text(report.title);
    document
      .fontSize(10)
      .fillColor('#667466')
      .text(
        `${report.from} – ${report.to} · ${report.rows.length} ${report.language === 'es' ? 'registros' : 'records'}`,
      );
    document.moveDown();
    if (!report.rows.length)
      document.text(
        report.language === 'es'
          ? 'No hay registros en este período.'
          : 'No records in this period.',
      );
    for (const row of report.rows) {
      const text = row.map((value, i) => `${report.columns[i]}: ${value}`).join('\n');
      if (document.y + document.heightOfString(text) + 25 > document.page.height - 42)
        document.addPage();
      document.fillColor('#20382f').fontSize(10).text(text, { lineGap: 3 });
      document.moveDown();
    }
    document.end();
    return done;
  }

  async emailReport(user: User, kind: unknown, input: unknown) {
    if (!this.email.available) fail('Email delivery is not configured for this clinic.', 503);
    const report = await this.build(user, kind, input);
    const pdf = await this.pdf(report);
    await this.email.sendReport({
      to: user.email,
      subject: `Pawstead · ${report.title}`,
      filename: `${report.kind}.pdf`,
      pdf,
    });
    return { message: `Report sent to ${user.email}` };
  }
}
