'use client';
import { useTranslations } from 'next-intl';
import { Heart, Plus, CalendarDays, Link } from 'lucide-react';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Empty, PageHeading, Status } from '@/components/common';
import { useClinic } from '@/components/context';
import { BookingForm } from '@/modules/appointments/forms/booking-form';
import { AppointmentDetail } from '@/modules/appointments/details/appointment-detail';
import { CaseForm } from '@/modules/cases/forms/case-form';
import { CheckpointForm } from '@/modules/cases/forms/checkpoint-form';
import { AttachForm } from '@/modules/cases/forms/attach-visit-form';
export function Cases() {
  const translate = useTranslations('clinic');
  const { data, open } = useClinic();
  const vet = data.user.role === 'vet';
  return (
    <>
      <PageHeading
        eyebrow={translate('careBeyondASingleVisit')}
        title={vet ? translate('careCases') : translate('yourPetSCareCases')}
        text={translate('followTheSmallStepsThatMakeUpABiggerCareJourney')}
        actions={
          vet && (
            <Button
              disabled={!data.pets.length}
              onClick={() =>
                open(
                  translate('createACareCase'),
                  translate('groupRelatedVisitsForOnePet'),
                  <CaseForm />,
                )
              }
            >
              <Plus size={17} />
              {translate('createCase')}
            </Button>
          )
        }
      />
      {!data.cases.length ? (
        <Empty
          title={translate('everyJourneyStartsSomewhere')}
          text={
            vet
              ? translate('createACaseWhenAPetNeedsCareAcrossSeveralVisits')
              : translate('theClinicWillCreateACaseWhenYourPetNeedsSeveralRelated')
          }
        />
      ) : (
        <div className="cases-list">
          {data.cases.map((c) => {
            const pet = data.pets.find((p) => p.id === c.petId);
            return (
              <section key={c.id} className="case-card">
                <div className="row-between">
                  <div className="case-title">
                    <span className="section-icon">
                      <Heart size={22} />
                    </span>
                    <div>
                      <h2>{c.name}</h2>
                      <p className="muted">
                        {pet?.name} · {c.checkpointIds.length}
                        {translate('checkpoints')}
                      </p>
                    </div>
                  </div>
                  {vet && (
                    <div className="card-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          open(
                            translate('linkAnExistingVisit'),
                            translate('addAnotherVisitForThisPetToTheEndOfTheCase'),
                            <AttachForm careCase={c} />,
                          )
                        }
                      >
                        <Link size={14} />
                        {translate('linkVisit')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          open(
                            translate('addACheckpoint'),
                            translate('doesThePetNeedToBeThereForTheNextStep'),
                            <CheckpointForm careCase={c} />,
                          )
                        }
                      >
                        <Plus size={14} />
                        {translate('addCheckpoint')}
                      </Button>
                    </div>
                  )}
                </div>
                <ol className="timeline">
                  {c.checkpointIds.map((key, i) => {
                    const a = data.appointments.find((a) => a.id === key);
                    if (!a) return null;
                    return (
                      <li key={key}>
                        <span className={`timeline-number ${a.status === 'Done' ? 'done' : ''}`}>
                          {i + 1}
                        </span>
                        <div className="timeline-body">
                          <div className="row-between">
                            <h3>
                              {vet ? a.symptoms : translate('checkpointValue0', { value0: i + 1 })}
                            </h3>
                            <Status status={a.status} />
                          </div>
                          <p>
                            <CalendarDays size={14} />
                            {dateLabel(a.scheduledAt, data.clinic.timezone)}
                          </p>
                          <div className="row-between">
                            <span className="small muted">
                              {a.petNeeded
                                ? translate('bringYourPet')
                                : translate('yourPetIsNotNeeded')}
                              {a.vetId
                                ? translate('drValue02', {
                                    value0: data.vets.find((v) => v.id === a.vetId)?.name ?? '',
                                  })
                                : ''}
                            </span>
                            {vet ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  open(
                                    translate('caseCheckpoint'),
                                    translate('visitDetailsAndClinicalPlan'),
                                    <AppointmentDetail id={a.id} />,
                                  )
                                }
                              >
                                {translate('openVisit')}
                              </Button>
                            ) : (
                              a.status === 'NeedsTime' && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    open(
                                      translate('chooseACheckpointTime'),
                                      translate('pickAnOpenTimeForYourPetSNextStep'),
                                      <BookingForm appointment={a} />,
                                    )
                                  }
                                >
                                  {translate('chooseATime')}
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {!c.checkpointIds.length && (
                  <p className="muted">
                    {translate('noCheckpointsYetAddTheNextStepWhenYouReReady')}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
