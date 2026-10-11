'use client';
import { useTranslations } from 'next-intl';
import { PawPrint, Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Empty, PageHeading } from '@/components/common';
import { useOwner } from '@/components/context';
import { PetForm } from '@/modules/pets/forms/pet-form';
import { BookingForm } from '@/modules/appointments/forms/booking-form';
import { AppointmentCards } from '@/modules/appointments/list/owner-appointment-cards';
export function Pets() {
  const translate = useTranslations('clinic');
  const { data, open, run, busy } = useOwner();
  return (
    <>
      <PageHeading
        eyebrow={translate('theWholeFamily')}
        title={translate('myPets')}
        text={translate('theirLittleDetailsTheirCompleteVisitHistory')}
        actions={
          <Button
            onClick={() =>
              open(translate('addAPet'), translate('tellUsALittleAboutYourCompanion'), <PetForm />)
            }
          >
            <Plus size={17} />
            {translate('addAPet')}
          </Button>
        }
      />
      {!data.pets.length ? (
        <Empty
          title={translate('whoSPartOfYourFamily')}
          text={translate('addYourFirstPetToGetStarted')}
        />
      ) : (
        <div className="pet-grid">
          {data.pets.map((p) => {
            const history = data.appointments
              .filter((a) => a.petId === p.id)
              .sort((a, b) =>
                (b.scheduledAt || b.createdAt).localeCompare(a.scheduledAt || a.createdAt),
              );
            return (
              <article className="pet-card" key={p.id}>
                <div className="row-between">
                  <span className={`pet-portrait ${p.species.toLowerCase()}`}>
                    <PawPrint size={36} />
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={translate('editValue0', { value0: p.name ?? '' })}
                    onClick={() =>
                      open(
                        translate('editValue0', { value0: p.name ?? '' }),
                        translate('keepTheirProfileUpToDate'),
                        <PetForm pet={p} />,
                      )
                    }
                  >
                    <Pencil size={17} />
                  </Button>
                </div>
                <h2>{p.name}</h2>
                <p className="muted">
                  {translate(p.species)} · {translate(p.sex.toLowerCase())}
                  {p.breed ? ` · ${p.breed}` : ''}
                </p>
                <dl className="pet-details">
                  <div>
                    <dt>{translate('ageBirthday')}</dt>
                    <dd>{p.dateOfBirth || p.approximateAge}</dd>
                  </div>
                  <div>
                    <dt>{translate('weight')}</dt>
                    <dd>
                      {p.weight
                        ? translate('value0Kg', { value0: p.weight ?? '' })
                        : translate('notRecorded')}
                    </dd>
                  </div>
                </dl>
                {p.notes && <p className="pet-notes">{p.notes}</p>}
                <div className="card-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      open(
                        translate('value0SVisitHistory', { value0: p.name ?? '' }),
                        translate('everyVisitAndTheVeterinarianWhoAttendedIt'),
                        history.length ? (
                          <AppointmentCards appointments={history} />
                        ) : (
                          <Empty
                            title={translate('noVisitsYet')}
                            text={translate('theirStoryStartsWithTheirFirstAppointment')}
                          />
                        ),
                      )
                    }
                  >
                    {translate('visitHistory')}
                    {history.length})
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      open(
                        translate('bookForValue0', { value0: p.name ?? '' }),
                        translate('tellUsWhatSGoingOnAndChooseAnOpenTime'),
                        <BookingForm petId={p.id} />,
                      )
                    }
                  >
                    {translate('bookVisit')}
                  </Button>
                  {!history.length && !data.cases.some((c) => c.petId === p.id) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={translate('deleteValue0', { value0: p.name ?? '' })}
                      disabled={busy}
                      onClick={() =>
                        open(
                          translate('deleteValue02', { value0: p.name ?? '' }),
                          translate('onlyPetsWithoutCareHistoryCanBeRemoved'),
                          <Button
                            variant="destructive"
                            onClick={() =>
                              void run(
                                () => api(`pets/${p.id}`, {}, 'DELETE'),
                                translate('petRemoved'),
                              )
                            }
                          >
                            {translate('deletePet')}
                          </Button>,
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
