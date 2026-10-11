'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, PageHeading } from '@/components/common';
import { useOwner } from '@/components/context';
import { PetForm } from '@/modules/pets/forms/pet-form';
import { BookingForm } from '@/modules/appointments/forms/booking-form';
import { AppointmentCards } from '@/modules/appointments/list/owner-appointment-cards';
export function OwnerAppointments() {
  const translate = useTranslations('clinic');
  const { data, open } = useOwner();
  const [filter, setFilter] = useState('active');
  const appointments = data.appointments
    .filter(
      (a) =>
        filter === 'all' ||
        (filter === 'active'
          ? a.status !== 'Done' && a.status !== 'Cancelled'
          : a.status === 'Done' || a.status === 'Cancelled'),
    )
    .sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
  return (
    <>
      <PageHeading
        eyebrow={translate('oneVisitAtATime')}
        title={translate('appointments')}
        text={translate('seeWhatSNextChooseANewTimeOrLookBackAt')}
        actions={
          <Button
            onClick={() =>
              open(
                data.pets.length ? translate('bookAVisit') : translate('addYourFirstPet'),
                data.pets.length
                  ? translate('chooseAnAvailableTimeInTheClinicSTimezone')
                  : translate('aPetProfileComesBeforeBooking'),
                data.pets.length ? <BookingForm /> : <PetForm />,
              )
            }
          >
            <Plus size={17} />
            {translate('bookAVisit')}
          </Button>
        }
      />
      <div className="tabs" role="group" aria-label={translate('appointmentFilter')}>
        {['active', 'history', 'all'].map((f) => (
          <button
            key={f}
            className={filter === f ? 'active' : ''}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'active'
              ? translate('upcomingNeedsATime')
              : f === 'history'
                ? translate('pastVisits')
                : translate('allVisits')}
          </button>
        ))}
      </div>
      {appointments.length ? (
        <AppointmentCards appointments={appointments} />
      ) : (
        <Empty
          title={translate('noAppointmentsHereYet')}
          text={translate('yourVisitsWillAppearHereAsYourPetSCareProgresses')}
        />
      )}
    </>
  );
}
