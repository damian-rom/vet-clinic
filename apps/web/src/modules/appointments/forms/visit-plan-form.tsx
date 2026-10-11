'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { Appointment, EstimatedActive } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
import { ActivesEditor } from '@/modules/appointments/forms/actives-editor';
export function PlanForm({ appointment }: { appointment: Appointment }) {
  const translate = useTranslations('clinic');
  const { data, run, busy } = useVet();
  const [actives, setActives] = useState<EstimatedActive[]>(
    appointment.plan?.estimatedActives || [],
  );
  const original = appointment.plan?.originalDraft;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        void run(
          () =>
            api(`appointments/${appointment.id}/plan`, {
              visitTypeId: v.visitTypeId,
              durationMinutes: Number(v.durationMinutes),
              estimatedActives: actives,
              revision: appointment.revision,
            }),
          translate('visitPlanSavedAndReviewed'),
        );
      }}
    >
      <div className="info-box">
        <strong>{data.pets.find((p) => p.id === appointment.petId)?.name}</strong>
        <p>{appointment.symptoms}</p>
      </div>
      <div className="form-grid">
        <Field label={translate('visitType')}>
          <select
            name="visitTypeId"
            defaultValue={
              appointment.plan?.visitTypeId || data.visitTypes.find((t) => !t.retired)?.id
            }
            required
          >
            {data.visitTypes
              .filter((t) => !t.retired || t.id === appointment.plan?.visitTypeId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.retired ? translate('retired') : ''}
                </option>
              ))}
          </select>
        </Field>
        <Field label={translate('plannedDurationMinutes')}>
          <input
            name="durationMinutes"
            type="number"
            min={1}
            max={540}
            step={1}
            required
            defaultValue={appointment.plan?.durationMinutes || 30}
          />
        </Field>
      </div>
      <ActivesEditor value={actives} onChange={setActives} />
      {actives.some(
        (item) => item.quantity > (data.products.find((p) => p.id === item.productId)?.stock || 0),
      ) && (
        <p className="notice warning">
          <AlertTriangle size={16} />
          {translate('someQuantitiesExceedCurrentStockYouCanSaveThisForecastStockChanges')}
        </p>
      )}
      {original && (
        <details className="draft-comparison">
          <summary>{translate('compareWithOriginalAiDraft')}</summary>
          <p>
            {data.visitTypes.find((t) => t.id === original.visitTypeId)?.name} ·{' '}
            {original.durationMinutes}
            {translate('minutes')}
          </p>
          <ul>
            {original.estimatedActives.map((item) => (
              <li key={item.productId}>
                {data.products.find((p) => p.id === item.productId)?.name}: {item.quantity}
              </li>
            ))}
          </ul>
          {!original.estimatedActives.length && <p>{translate('noEstimatedSupplies')}</p>}
        </details>
      )}
      <Button
        type="submit"
        disabled={
          busy || !data.visitTypes.some((t) => !t.retired || t.id === appointment.plan?.visitTypeId)
        }
      >
        <Check size={16} />
        {busy
          ? translate('saving')
          : appointment.plan?.source === 'ai-draft'
            ? translate('reviewSavePlan')
            : translate('saveVisitPlan')}
      </Button>
    </form>
  );
}
