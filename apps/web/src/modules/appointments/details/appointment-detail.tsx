'use client';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Field, formValues, Status } from '@/components/common';
import { useVet } from '@/components/context';
import { draftAppointments } from '@/modules/appointments/services';
import { PlanForm } from '@/modules/appointments/forms/visit-plan-form';
import { CompleteForm } from '@/modules/appointments/forms/complete-visit-form';
import { RescheduleForm } from '@/modules/appointments/forms/reschedule-form';
export function AppointmentDetail({ id }: { id: string }) {
  const translate = useTranslations('clinic');
  const { data, busy, open, run } = useVet();
  const a = data.appointments.find((a) => a.id === id);
  if (!a) return null;
  const terminal = a.status === 'Done' || a.status === 'Cancelled';
  const pet = data.pets.find((p) => p.id === a.petId);
  const vet = data.vets.find((v) => v.id === a.vetId);
  const source = a.plan?.source;
  const reviewer = data.vets.find((v) => v.id === a.plan?.reviewedBy);
  return (
    <div className="appointment-detail">
      <div className="row-between">
        <h3>
          {pet?.name} · {pet?.species}
        </h3>
        <Status status={a.status} />
      </div>
      <p className="symptoms">{a.symptoms}</p>
      <div className="detail-meta">
        <span>{dateLabel(a.scheduledAt, data.clinic.timezone)}</span>
        <span>
          {vet ? translate('drValue0', { value0: vet.name ?? '' }) : translate('notYetAssigned')}
        </span>
      </div>
      {pet?.notes && (
        <p className="info-box">
          <strong>{translate('petNotes')}</strong> {pet.notes}
        </p>
      )}
      {a.plan && (
        <div className="plan-summary">
          <div className="row-between">
            <h4>{translate('visitPlan')}</h4>
            <span className={`plan-badge ${source}`}>
              {source === 'ai-draft'
                ? translate('filledByAi')
                : source === 'ai-reviewed'
                  ? translate('aiDraftedReviewedByDrValue0', { value0: reviewer?.name ?? '' })
                  : translate('plannedByDrValue0', { value0: (reviewer?.name || 'vet') ?? '' })}
            </span>
          </div>
          <p>
            {data.visitTypes.find((t) => t.id === a.plan!.visitTypeId)?.name} ·{' '}
            {a.plan.durationMinutes} {translate('minutes')}
          </p>
          <ul>
            {a.plan.estimatedActives.map((item) => (
              <li key={item.productId}>
                {data.products.find((p) => p.id === item.productId)?.name} · {item.quantity}{' '}
                {data.products.find((p) => p.id === item.productId)?.unit}
              </li>
            ))}
          </ul>
          {!a.plan.estimatedActives.length && (
            <p className="muted small">{translate('noEstimatedSupplies')}</p>
          )}
          {a.plan.originalDraft && (
            <details>
              <summary>{translate('originalAiDraft')}</summary>
              <p>
                {data.visitTypes.find((t) => t.id === a.plan!.originalDraft!.visitTypeId)?.name} ·{' '}
                {a.plan.originalDraft.durationMinutes} {translate('min')}
              </p>
              <ul>
                {a.plan.originalDraft.estimatedActives.map((i) => (
                  <li key={i.productId}>
                    {data.products.find((p) => p.id === i.productId)?.name}: {i.quantity}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {a.status === 'Done' && (
        <div className="info-box">
          <h4>{translate('actuallyUsed')}</h4>
          {a.actualActives?.length ? (
            <ul>
              {a.actualActives.map((item) => (
                <li key={item.productId}>
                  {data.products.find((p) => p.id === item.productId)?.name}: {item.quantity}{' '}
                  {data.products.find((p) => p.id === item.productId)?.unit}
                </li>
              ))}
            </ul>
          ) : (
            <p>{translate('noSuppliesUsed')}</p>
          )}
          <p>
            {translate('completed')}
            {dateLabel(a.completedAt, data.clinic.timezone)}
            {translate('byDr')}
            {vet?.name}
          </p>
        </div>
      )}
      {!terminal && (
        <>
          <div className="card-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                open(
                  translate('planTheVisit'),
                  translate('thePlanIsInternalYourReviewMakesAnAiDraftYourOwn'),
                  <PlanForm key={a.revision} appointment={a} />,
                )
              }
            >
              {translate('editVisitPlan')}
            </Button>
            <Button
              variant="outline"
              disabled={
                busy || !data.aiAvailable || (source !== undefined && source !== 'ai-draft')
              }
              title={
                !data.aiAvailable
                  ? translate('aiProviderIsNotConfigured')
                  : translate('humanPlansArePreserved')
              }
              onClick={() =>
                void run(() => draftAppointments([a.id]), translate('aiDraftReadyForReview'), false)
              }
            >
              <Sparkles size={15} />
              {translate('draftWithAi')}
            </Button>
          </div>
          {['AwaitingConfirmation', 'Confirmed'].includes(a.status) && (
            <form
              className="assign-form"
              onSubmit={(e) => {
                e.preventDefault();
                const v = formValues(e.currentTarget);
                void run(
                  () => api(`appointments/${a.id}/assign`, { vetId: v.vetId }),
                  translate('veterinarianAssignedAppointmentConfirmed'),
                );
              }}
            >
              <Field label={translate('assignVeterinarian')}>
                <select name="vetId" defaultValue={a.vetId || data.user.id}>
                  {data.vets.map((v) => (
                    <option key={v.id} value={v.id}>
                      {translate('dr')} {v.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button disabled={busy} type="submit">
                {a.status === 'Confirmed' ? translate('reassign') : translate('assignConfirm')}
              </Button>
            </form>
          )}
          <div className="card-actions">
            {a.status === 'Confirmed' && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    open(
                      translate('moveAppointment'),
                      translate('theNewTimeMustFitTheCalendarAndClinicAvailability'),
                      <RescheduleForm appointment={a} />,
                    )
                  }
                >
                  {translate('reschedule')}
                </Button>
                <Button
                  disabled={
                    busy ||
                    !a.plan ||
                    a.plan.source === 'ai-draft' ||
                    Date.parse(a.scheduledAt!) > Date.now()
                  }
                  onClick={() =>
                    open(
                      translate('completeTheVisit'),
                      translate('confirmTheSuppliesActuallyUsedBeforeFinishing'),
                      <CompleteForm appointment={a} />,
                    )
                  }
                >
                  {translate('markDone')}
                </Button>
              </>
            )}
            {a.status !== 'NeedsTime' && !(a.caseId && a.petNeeded === false) && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  open(
                    translate('askOwnerForANewTime'),
                    translate('thisReleasesTheCurrentReservationAndPromptsTheOwnerInTheirPortal'),
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api(`appointments/${a.id}/request-time`, {}),
                          translate('ownerPromptedToChooseANewTime'),
                        )
                      }
                    >
                      {translate('askOwnerForANewTime2')}
                    </Button>,
                  )
                }
              >
                {translate('askOwnerForANewTime2')}
              </Button>
            )}
          </div>
        </>
      )}
      {!data.aiAvailable && !terminal && (
        <p className="muted small">
          {translate('aiDraftingIsUnavailableUntilTheClinicConfiguresItsProvider')}
        </p>
      )}
    </div>
  );
}
