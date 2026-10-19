'use client';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Heart,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { ButtonLink } from '@/components/button';
import { Empty, PageHeading } from '@/components/common';
import { useVet } from '@/components/context';
import { AppointmentTable } from '@/modules/appointments/list/appointment-table';
export function VetHome() {
  const translate = useTranslations('clinic');
  const { data } = useVet();
  const waiting = data.appointments.filter((a) => a.status === 'AwaitingConfirmation');
  const mine = data.appointments
    .filter(
      (a) =>
        a.vetId === data.user.id &&
        a.status === 'Confirmed' &&
        Date.parse(a.scheduledAt!) > Date.now(),
    )
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const unplanned = data.appointments.filter(
    (a) =>
      ['Confirmed', 'AwaitingConfirmation'].includes(a.status) &&
      (!a.plan || a.plan.source === 'ai-draft'),
  );
  const low = data.products.filter((p) => p.needed > p.stock);
  return (
    <>
      <PageHeading
        eyebrow={translate('yourClinicAtAGlance')}
        title={translate('goodToSeeYouDrValue0', { value0: data.user.name.split(' ')[0] ?? '' })}
        text={translate('aClearViewOfWhatNeedsYourCareToday')}
        actions={
          <ButtonLink href="#calendar">
            <CalendarDays size={17} />
            {translate('myCalendar')}
          </ButtonLink>
        }
      />
      <div className="stats">
        <div>
          <ClipboardList />
          <strong>{waiting.length}</strong>
          <span>{translate('awaitingConfirmation')}</span>
        </div>
        <div>
          <CalendarDays />
          <strong>{mine.length}</strong>
          <span>{translate('yourScheduledVisits')}</span>
        </div>
        <div>
          <Sparkles />
          <strong>{unplanned.length}</strong>
          <span>{translate('plansToWriteOrReview')}</span>
        </div>
        <div>
          <Heart />
          <strong>{data.cases.length}</strong>
          <span>{translate('careCases')}</span>
        </div>
      </div>
      {low.length > 0 && (
        <a href="#inventory" className="notice warning">
          <AlertTriangle size={19} />
          {low.length} {translate('productsFallShortOfUpcomingPlansReviewInventory')}
          <ArrowRight size={16} />
        </a>
      )}
      <section className="section">
        <div className="section-heading">
          <h2>{translate('readyForConfirmation')}</h2>
          <a href="#appointments">
            {translate('allAppointments')}
            <ArrowRight size={14} />
          </a>
        </div>
        {waiting.length ? (
          <AppointmentTable appointments={waiting.slice(0, 5)} />
        ) : (
          <Empty
            title={translate('allCaughtUp')}
            text={translate('noAppointmentsAreWaitingForConfirmation')}
          />
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>{translate('yourNextVisits')}</h2>
          <a href="#calendar">
            {translate('openCalendar')}
            <ArrowRight size={14} />
          </a>
        </div>
        {mine.length ? (
          <AppointmentTable appointments={mine.slice(0, 5)} />
        ) : (
          <Empty
            title={translate('roomForTheNextPatient')}
            text={translate('assignYourselfAnAppointmentToAddItToYourCalendar')}
          />
        )}
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>{translate('howCareIsTakingShape')}</h2>
        </div>
        <div className="metrics">
          <div>
            <strong>{data.metrics.plannedBeforeVisitPercent}%</strong>
            <p>{translate('completedVisitsPlannedBeforeTheirStart')}</p>
          </div>
          <div>
            <strong>{data.metrics.aiKeptWithMinorEditsPercent}%</strong>
            <p>{translate('reviewedAiDraftsKeptWithMinorEdits')}</p>
          </div>
          <div>
            <strong>{data.metrics.completedVisits}</strong>
            <p>{translate('visitsCompleted')}</p>
          </div>
        </div>
      </section>
    </>
  );
}
