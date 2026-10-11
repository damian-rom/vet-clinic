'use client';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarDays, Heart, PawPrint, Plus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, PageHeading } from '@/components/common';
import { useOwner } from '@/components/context';
import { PetForm } from '@/modules/pets/forms/pet-form';
import { BookingForm } from '@/modules/appointments/forms/booking-form';
import { AppointmentCards } from '@/modules/appointments/list/owner-appointment-cards';
export function OwnerHome() {
  const translate = useTranslations('clinic');
  const { data, open } = useOwner();
  const needs = data.appointments.filter((a) => a.status === 'NeedsTime');
  const upcoming = data.appointments
    .filter((a) => a.status === 'Confirmed' || a.status === 'AwaitingConfirmation')
    .sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
  const book = () =>
    data.pets.length
      ? open(
          translate('bookAVisit'),
          translate('aFewDetailsAnOpenTimeAndYouReOnYourWay'),
          <BookingForm />,
        )
      : open(
          translate('meetYourFirstPet'),
          translate('registerAPetBeforeBookingTheirFirstVisit'),
          <PetForm />,
        );
  return (
    <>
      <PageHeading
        eyebrow={translate('yourFamilyInGoodHands')}
        title={translate('helloValue0', { value0: data.user.name.split(' ')[0] ?? '' })}
        text={translate('aLittleOverviewOfTheCareThatSComingUp')}
        actions={
          <Button onClick={book}>
            <Plus size={17} />
            {translate('bookAVisit')}
          </Button>
        }
      />
      <div className="welcome-banner">
        <div>
          <span className="pill">{translate('careAllInOnePlace')}</span>
          <h2>
            {translate('everySmallStep')}
            <br />
            {translate('everyWagAndPurr')}
          </h2>
          <p>{translate('keepYourFamilySAppointmentsAndFollowUpsTogether')}</p>
          <Button variant="outline" asChild>
            <a href="#pets">
              {translate('meetYourPets')}
              <ArrowRight size={16} />
            </a>
          </Button>
        </div>
        <div className="banner-paw" aria-hidden="true">
          <PawPrint size={110} strokeWidth={1.3} />
          <Heart size={30} />
        </div>
      </div>
      <div className="stats">
        <div>
          <PawPrint />
          <strong>{data.pets.length}</strong>
          <span>{translate('petsInYourFamily')}</span>
        </div>
        <div>
          <CalendarDays />
          <strong>{upcoming.length}</strong>
          <span>{translate('upcomingVisits')}</span>
        </div>
        <div>
          <Heart />
          <strong>{data.cases.length}</strong>
          <span>{translate('careCases')}</span>
        </div>
      </div>
      {needs.length > 0 && (
        <section className="section">
          <div className="section-heading">
            <h2>
              <Clock size={19} />
              {translate('aNewTimeIsNeeded')}
            </h2>
            <span className="count">{needs.length}</span>
          </div>
          <AppointmentCards appointments={needs} />
        </section>
      )}
      <section className="section">
        <div className="section-heading">
          <h2>{translate('comingUp')}</h2>
          <a href="#appointments">
            {translate('allAppointments')}
            <ArrowRight size={14} />
          </a>
        </div>
        {upcoming.length ? (
          <AppointmentCards appointments={upcoming.slice(0, 4)} />
        ) : (
          <Empty
            title={translate('aFreshStartForCare')}
            text={translate('registerYourPetAndRequestAVisitWheneverTheyNeedUs')}
            action={
              <Button variant="outline" onClick={book}>
                {translate('bookAVisit')}
              </Button>
            }
          />
        )}
      </section>
    </>
  );
}
