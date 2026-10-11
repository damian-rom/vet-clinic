import PDFDocument from 'pdfkit';
import { z } from 'zod';
import type { User } from '@vet-clinic/types';
import { Store } from '../infrastructure/sqlite/store';
import { fail, find, requireVet } from '../domain/rules';
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

/** Reports use SQL joins between real persisted tables, never caller-supplied SQL. */
export class ReportsService {
  constructor(
    private readonly store: Store,
    readonly email: EmailPort = new SmtpEmailAdapter(),
  ) {}

  build(user: User, kindInput: unknown, input: unknown): ClinicReport {
    const kind = reportKindSchema.parse(kindInput);
    const filters = reportFiltersSchema.parse(input);
    const spanish = filters.language === 'es';
    if (kind !== 'care-history') requireVet(user);
    if (filters.petId) {
      const pet = find(this.store.read().pets, filters.petId);
      if (user.role === 'owner' && pet.ownerId !== user.id) fail('Record not found', 404);
    }
    const range = (date: string) =>
      date.slice(0, 10) >= filters.from && date.slice(0, 10) <= filters.to;
    // Owner rows deliberately exclude visit plans, actives and AI provenance.
    if (kind === 'care-history' || kind === 'clinic-activity') {
      const joined = this.store.query(`
        SELECT a.document AS appointment, p.document AS pet,
               o.document AS owner, v.document AS vet, t.document AS visitType
        FROM appointments a
        JOIN pets p ON p.id = json_extract(a.document, '$.petId')
        JOIN users o ON o.id = json_extract(a.document, '$.ownerId')
        LEFT JOIN users v ON v.id = json_extract(a.document, '$.vetId')
        LEFT JOIN visitTypes t ON t.id = json_extract(a.document, '$.plan.visitTypeId')
        ORDER BY COALESCE(json_extract(a.document, '$.scheduledAt'), json_extract(a.document, '$.createdAt'))
      `);
      const rows = joined.flatMap((row) => {
        const a = JSON.parse(row.appointment as string) as {
          ownerId: string;
          petId: string;
          status: string;
          scheduledAt?: string;
          createdAt: string;
          plan?: { durationMinutes: number };
        };
        if (
          (user.role === 'owner' && a.ownerId !== user.id) ||
          (filters.petId && a.petId !== filters.petId) ||
          !range(a.scheduledAt || a.createdAt)
        )
          return [];
        const pet = JSON.parse(row.pet as string) as { name: string };
        const owner = JSON.parse(row.owner as string) as User;
        const vet = row.vet ? (JSON.parse(row.vet as string) as User) : undefined;
        const values = [
          pet.name,
          owner.name,
          a.scheduledAt || (spanish ? 'Sin hora' : 'No time'),
          a.status,
          vet?.name || '—',
        ];
        if (kind === 'clinic-activity') {
          const type = row.visitType
            ? (JSON.parse(row.visitType as string) as { name: string })
            : undefined;
          values.push(type?.name || '—', String(a.plan?.durationMinutes || 30));
        }
        return [values];
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
    const rows = this.store
      .query(
        `
      SELECT m.document AS movement, p.document AS product, u.document AS vet
      FROM movements m
      JOIN products p ON p.id = json_extract(m.document, '$.productId')
      JOIN users u ON u.id = json_extract(m.document, '$.performedBy')
      ORDER BY json_extract(m.document, '$.performedAt')
    `,
      )
      .flatMap((row) => {
        const m = JSON.parse(row.movement as string) as {
          performedAt: string;
          type: string;
          quantity: number;
          reason?: string;
          appointmentId?: string;
        };
        if (!range(m.performedAt)) return [];
        const p = JSON.parse(row.product as string) as { name: string; unit: string };
        const u = JSON.parse(row.vet as string) as User;
        return [
          [
            m.performedAt,
            p.name,
            m.type,
            `${m.quantity} ${p.unit}`,
            u.name,
            m.reason || m.appointmentId || '—',
          ],
        ];
      });
    return {
      kind,
      title: spanish ? 'Movimientos de inventario' : 'Inventory usage',
      columns: spanish
        ? ['Fecha (UTC)', 'Producto', 'Movimiento', 'Cantidad', 'Veterinario', 'Motivo / visita']
        : ['Date (UTC)', 'Product', 'Movement', 'Quantity', 'Veterinarian', 'Reason / visit'],
      rows,
      ...filters,
    };
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
    const report = this.build(user, kind, input);
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
