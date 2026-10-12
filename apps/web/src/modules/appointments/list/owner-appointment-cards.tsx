'use client';
import { useTranslations } from 'next-intl';
import { CalendarDays, Heart, PawPrint } from 'lucide-react';
import type { OwnerAppointment } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Status } from '@/components/common';
import { useOwner } from '@/components/context';
import { BookingForm } from '@/modules/appointments/forms/booking-form';
export function AppointmentCards({ appointments }: { appointments: OwnerAppointment[] }) {
  const translate = useTranslations('clinic');
  const { data, busy, open, run } = useOwner();
  return (
    <div className="appointment-cards">
      {appointments.map((a) => {
        const pet = data.pets.find((p) => p.id === a.petId);
        const vet = data.vets.find((v) => v.id === a.vetId);
        const cancellable =
          !a.caseId &&
          !['Done', 'Cancelled'].includes(a.status) &&
          (!a.scheduledAt || Date.parse(a.scheduledAt) > Date.now());
        return (
          <article key={a.id} className="appointment-card">
            <div className="pet-symbol">
              <PawPrint size={22} />
            </div>
            <div className="appointment-body">
              <div className="row-between">
                <h3>
                  {pet?.name || 'Pet'}
                  <span className="small muted">
                    {a.caseId ? translate('caseCheckpoint') : translate('clinicVisit')}
                  </span>
                </h3>
                <Status status={a.status} />
              </div>
              <p>{a.symptoms}</p>
              <div className="appointment-meta">
                <span>
                  <CalendarDays size={15} />
                  {dateLabel(a.scheduledAt, data.clinic.timezone)}
                </span>
                {vet && (
                  <span>
                    {translate('dr')} {vet.name}
                  </span>
                )}
                {a.caseId && (
                  <span>
                    <Heart size={14} />
                    {a.petNeeded ? translate('bringYourPet') : translate('petNotNeeded')}
                  </span>
                )}
              </div>
              {(a.status === 'NeedsTime' || cancellable) && (
                <div className="card-actions">
                  {a.status === 'NeedsTime' && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        open(
                          translate('chooseANewTime'),
                          translate('theClinicIsReadyForYourNextStep'),
                          <BookingForm appointment={a} />,
                        )
                      }
                    >
                      {translate('chooseATime')}
                    </Button>
                  )}
                  {cancellable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        open(
                          translate('cancelThisAppointment'),
                          translate('yourVisitStaysInTheHistoryAndItsTimeBecomesAvailableTo'),
                          <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => api(`appointments/${a.id}/cancel`, {}),
                                translate('appointmentCancelled'),
                              )
                            }
                          >
                            {translate('confirmCancellation')}
                          </Button>,
                        )
                      }
                    >
                      {translate('cancelAppointment')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
