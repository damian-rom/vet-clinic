'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Case } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { instant } from '@/lib/time';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function CheckpointForm({ careCase }: { careCase: Case }) {
  const translate = useTranslations('clinic');
  const { data, busy, run } = useVet();
  const [petNeeded, setPetNeeded] = useState(true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        void run(
          () =>
            api(`cases/${careCase.id}/checkpoints`, {
              symptoms: v.symptoms,
              petNeeded,
              ...(!petNeeded
                ? { scheduledAt: instant(v.date, v.time, data.clinic.timezone), vetId: v.vetId }
                : {}),
            }),
          petNeeded
            ? translate('checkpointAddedOwnerPromptedToChooseATime')
            : translate('checkpointAddedAndConfirmed'),
        );
      }}
    >
      <Field label={translate('nextStep')}>
        <textarea
          name="symptoms"
          required
          placeholder={translate('describeThisCheckpoint')}
          maxLength={4000}
        />
      </Field>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={petNeeded}
          onChange={(e) => setPetNeeded(e.target.checked)}
        />
        {translate('thePetIsNeededForThisStep')}
      </label>
      {petNeeded ? (
        <p className="info-box">
          {translate('theOwnerWillChooseATimeAVeterinarianThenConfirmsIt')}
        </p>
      ) : (
        <>
          <div className="form-grid">
            <Field label={translate('day')}>
              <input type="date" name="date" required />
            </Field>
            <Field label={translate('time')} hint={data.clinic.timezone}>
              <input name="time" type="time" step={1800} required />
            </Field>
          </div>
          <Field label={translate('veterinarian')}>
            <select name="vetId" defaultValue={data.user.id}>
              {data.vets.map((v) => (
                <option key={v.id} value={v.id}>
                  {translate('dr')} {v.name}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Button type="submit" disabled={busy}>
        {translate('addCheckpoint')}
      </Button>
    </form>
  );
}
