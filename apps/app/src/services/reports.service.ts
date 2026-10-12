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
    // Owner rows deliberately exclude visit plans, actives and AI provenance.
    if (kind === 'care-history' || kind === 'clinic-activity') {
      const ownerId = user.role === 'owner' ? user.id : '';
      const petId = filters.petId || '';
      const joined = this.store.query(
        `
        SELECT p.name AS pet_name, o.name AS owner_name,
               a.scheduled_at, a.status, v.name AS vet_name,
               t.name AS visit_type_name, COALESCE(plan.duration_minutes, 30) AS duration_minutes
        FROM appointments a
        JOIN pets p ON p.id = a.pet_id
        JOIN users o ON o.id = a.owner_id
        LEFT JOIN users v ON v.id = a.vet_id
        LEFT JOIN appointment_plans plan ON plan.appointment_id = a.id
        LEFT JOIN visit_types t ON t.id = plan.visit_type_id
        WHERE substr(COALESCE(a.scheduled_at, a.created_at), 1, 10) BETWEEN ? AND ?
          AND (? = '' OR a.owner_id = ?)
          AND (? = '' OR a.pet_id = ?)
        ORDER BY COALESCE(a.scheduled_at, a.created_at), a.rowid
      `,
        filters.from,
        filters.to,
        ownerId,
        ownerId,
        petId,
        petId,
      );
      const rows = joined.map((row) => {
        const values = [
          String(row.pet_name),
          String(row.owner_name),
          String(row.scheduled_at ?? (spanish ? 'Sin hora' : 'No time')),
          String(row.status),
          String(row.vet_name ?? '—'),
        ];
        if (kind === 'clinic-activity')
          values.push(String(row.visit_type_name ?? '—'), String(row.duration_minutes));
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
    const petId = filters.petId || '';
    const rows = this.store
      .query(
        `
        SELECT m.performed_at, m.type, m.quantity, m.reason, m.appointment_id,
               p.name AS product_name, p.unit, u.name AS vet_name
        FROM movements m
        JOIN products p ON p.id = m.product_id
        JOIN users u ON u.id = m.performed_by
        LEFT JOIN appointments a ON a.id = m.appointment_id
        WHERE substr(m.performed_at, 1, 10) BETWEEN ? AND ?
          AND (? = '' OR a.pet_id = ?)
        ORDER BY m.performed_at, m.rowid
      `,
        filters.from,
        filters.to,
        petId,
        petId,
      )
      .map((row) => [
        String(row.performed_at),
        String(row.product_name),
        String(row.type),
        `${row.quantity} ${row.unit}`,
        String(row.vet_name),
        String(row.reason || row.appointment_id || '—'),
      ]);
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
