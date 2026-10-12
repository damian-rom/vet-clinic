'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Download, FileText, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { today } from '@/lib/time';
import { Button, ButtonLink } from '@/components/button';
import { Empty, Field, PageHeading } from '@/components/common';
import { useClinic } from '@/components/context';
type ReportKind = 'care-history' | 'clinic-activity' | 'inventory-usage';
interface Report {
  title: string;
  columns: string[];
  rows: string[][];
}
export function Reports() {
  const translate = useTranslations('clinic');
  const { data, run, busy } = useClinic();
  const locale = useLocale();
  const [from, setFrom] = useState(`${today(data.clinic).slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today(data.clinic));
  const [kind, setKind] = useState<ReportKind>('care-history');
  const [petId, setPetId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const filters = {
    from,
    to,
    language: locale,
    ...(petId && kind === 'care-history' ? { petId } : {}),
  };
  const query = new URLSearchParams(filters).toString();
  const choices: {
    kind: ReportKind;
    title: string;
    text: string;
  }[] = [
    {
      kind: 'care-history',
      title: translate('careHistory'),
      text: translate('visitsJoinedWithPetsOwnersAndAttendingVeterinarians'),
    },
    ...(data.user.role === 'vet'
      ? [
          {
            kind: 'clinic-activity' as const,
            title: translate('clinicActivity'),
            text: translate('appointmentsPetsVisitTypesAndVeterinariansInOneReport'),
          },
          {
            kind: 'inventory-usage' as const,
            title: translate('inventoryUsage'),
            text: translate('productsAndStockMovementsWithThePeopleWhoRecordedThem'),
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeading
        eyebrow={translate('careYouCanLookBackOn')}
        title={translate('reports')}
        text={translate('reviewJoinedClinicRecordsDownloadAPdfOrEmailItToYour')}
      />
      <div className="report-cards">
        {choices.map((r) => (
          <button
            type="button"
            key={r.kind}
            className={`report-card ${kind === r.kind ? 'selected' : ''}`}
            onClick={() => {
              setKind(r.kind);
              setReport(null);
            }}
            aria-pressed={kind === r.kind}
          >
            <FileText size={23} />
            <h2>{r.title}</h2>
            <p>{r.text}</p>
          </button>
        ))}
      </div>
      <form
        className="panel section"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            async () => setReport(await api<Report>(`reports/${kind}?${query}`)),
            translate('reportGenerated'),
            false,
          );
        }}
      >
        <div className="form-grid">
          <Field label={translate('from')}>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setReport(null);
              }}
              required
            />
          </Field>
          <Field label={translate('to')}>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                setReport(null);
              }}
              required
            />
          </Field>
        </div>
        {kind === 'care-history' && (
          <Field label={translate('pet')}>
            <select
              value={petId}
              onChange={(e) => {
                setPetId(e.target.value);
                setReport(null);
              }}
            >
              <option value="">{translate('allPets')}</option>
              {data.pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="card-actions">
          <Button type="submit" disabled={busy}>
            {translate('generateReport')}
          </Button>
          <ButtonLink variant="outline" href={`/api/reports/${kind}?${query}&format=pdf`} download>
            <Download size={16} />
            {translate('downloadPdf')}
          </ButtonLink>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => api(`reports/${kind}/email`, filters),
                translate('reportEmailedToValue0', { value0: data.user.email ?? '' }),
                false,
              )
            }
          >
            <Mail size={16} />
            {translate('emailToMe')}
          </Button>
        </div>
        <p className="muted small">
          {translate('emailDeliveryRequiresTheClinicSEmailServiceToBeConfiguredReports')}
        </p>
      </form>
      {report && (
        <section className="report-preview">
          <h2>{report.title}</h2>
          {report.rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={translate('noRecordsInThisPeriod')}
              text={translate('tryADifferentDateRange')}
            />
          )}
        </section>
      )}
    </>
  );
}
