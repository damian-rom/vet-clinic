'use client';
import { useTranslations } from 'next-intl';
import type { Case } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function AttachForm({ careCase }: { careCase: Case }) {
  const translate = useTranslations('clinic');
  const { data, busy, run } = useVet();
  const candidates = data.appointments.filter(
    (a) => a.petId === careCase.petId && !a.caseId && a.status !== 'Cancelled',
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        void run(
          () => api(`cases/${careCase.id}/attach`, { appointmentId: v.appointmentId }),
          translate('visitLinkedToCareCase'),
        );
      }}
    >
      <Field label={translate('existingAppointment')}>
        <select name="appointmentId" required>
          {candidates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.symptoms} · {dateLabel(a.scheduledAt, data.clinic.timezone)}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={busy || !candidates.length}>
        {translate('linkVisit')}
      </Button>
    </form>
  );
}
