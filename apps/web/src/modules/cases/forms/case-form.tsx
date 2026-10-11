'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function CaseForm() {
  const translate = useTranslations('clinic');
  const { data, run, busy } = useVet();
  const [petId, setPetId] = useState(data.pets[0]?.id || '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const v = formValues(form);
        const appointmentIds = new FormData(form).getAll('appointmentIds');
        void run(
          () => api('cases', { petId, name: v.name, appointmentIds }),
          translate('careCaseCreated'),
        );
      }}
    >
      <Field label={translate('caseName')}>
        <input name="name" required placeholder={translate('lunaSLimp')} maxLength={200} />
      </Field>
      <Field label={translate('pet')}>
        <select value={petId} onChange={(e) => setPetId(e.target.value)} required>
          {data.pets.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name} · {data.owners.find((o) => o.id === p.ownerId)?.name}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="checkpoint-options">
        <legend>{translate('existingVisitsToIncludeOptional')}</legend>
        {data.appointments
          .filter((a) => a.petId === petId && !a.caseId && a.status !== 'Cancelled')
          .map((a) => (
            <label key={a.id}>
              <input type="checkbox" name="appointmentIds" value={a.id} />
              {a.symptoms} · {dateLabel(a.scheduledAt, data.clinic.timezone)}
            </label>
          ))}
      </fieldset>
      <Button type="submit" disabled={busy || !petId}>
        {translate('createCase')}
      </Button>
    </form>
  );
}
