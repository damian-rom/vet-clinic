'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { addDays, dateInClinic, instant, timeLabel, today } from '@/lib/time';
import { api } from '@/lib/api';
import { Button } from '@/components/button';
import { PageHeading } from '@/components/common';
import { useVet } from '@/components/context';
import { AppointmentDetail } from '@/modules/appointments/details/appointment-detail';
const ROW_HEIGHT = 48;
export function monday(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function Calendar() {
  const translate = useTranslations('clinic');
  const locale = useLocale();
  const { data, open, run, busy } = useVet();
  const [week, setWeek] = useState(monday(today(data.clinic)));
  const [vetId, setVetId] = useState(data.user.id);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const slots = Array.from(
    { length: (data.clinic.closeHour - data.clinic.openHour) * 2 },
    (_, i) =>
      `${String(data.clinic.openHour + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
  );
  const events = data.appointments.filter(
    (a) => a.status === 'Confirmed' && a.vetId === vetId && a.scheduledAt,
  );
  return (
    <>
      <PageHeading
        eyebrow={translate('makeSpaceForGoodCare')}
        title={translate('weeklyCalendar')}
        text={translate('dragAVisitToMoveItOverlappingMovesAreRefusedSoThe')}
        actions={
          <select
            aria-label={translate('calendarVeterinarian')}
            value={vetId}
            onChange={(e) => setVetId(e.target.value)}
          >
            {data.vets.map((v) => (
              <option key={v.id} value={v.id}>
                {translate('drValue0', { value0: v.name })}
                {v.id === data.user.id ? ` ${translate('you')}` : ''}
              </option>
            ))}
          </select>
        }
      />
      <div className="calendar-toolbar">
        <input
          className="week-picker"
          type="date"
          aria-label={translate('calendarWeek')}
          value={week}
          onChange={(e) => {
            if (e.target.value) setWeek(monday(e.target.value));
          }}
        />
        <div className="card-actions">
          <Button
            size="icon"
            variant="outline"
            aria-label={translate('previousWeek')}
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft size={18} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setWeek(monday(today(data.clinic)))}>
            {translate('thisWeek')}
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={translate('nextWeek')}
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
        <h2>
          {new Date(`${week}T12:00:00Z`).toLocaleDateString(locale, {
            month: 'long',
            day: 'numeric',
          })}{' '}
          –{' '}
          {new Date(`${addDays(week, 6)}T12:00:00Z`).toLocaleDateString(locale, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </h2>
        <span className="muted small">
          <CalendarDays size={15} />
          {data.clinic.timezone}
        </span>
      </div>
      <div className="calendar-scroll">
        <div className="calendar-grid">
          <div className="calendar-times">
            <div className="calendar-day-heading" />
            {slots.map((time, i) => (
              <div key={time} style={{ height: ROW_HEIGHT }}>
                {i % 2 === 0 ? time : ''}
              </div>
            ))}
          </div>
          {dates.map((date, day) => {
            const start = Date.parse(instant(date, '09:00', data.clinic.timezone));
            const end = Date.parse(instant(date, '18:00', data.clinic.timezone));
            return (
              <div className="calendar-column" key={date}>
                <div
                  className={`calendar-day-heading ${date === today(data.clinic) ? 'today' : ''}`}
                >
                  <small>
                    {new Date(`${date}T12:00:00Z`)
                      .toLocaleDateString(locale, { weekday: 'short' })
                      .toLocaleUpperCase(locale)}
                  </small>
                  <strong>{Number(date.slice(-2))}</strong>
                </div>
                <div
                  className={`calendar-day-body ${day >= 5 ? 'closed' : ''}`}
                  style={{ height: slots.length * ROW_HEIGHT }}
                >
                  {slots.map((time, i) => (
                    <div
                      key={time}
                      className="calendar-drop"
                      style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                      onDragOver={(e) => {
                        if (!busy && day < 5) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const key = e.dataTransfer.getData('text/plain');
                        const appointment = data.appointments.find((a) => a.id === key);
                        if (!appointment || busy || day >= 5) return;
                        void run(
                          () =>
                            api(`appointments/${key}/reschedule`, {
                              scheduledAt: instant(date, time, data.clinic.timezone),
                              revision: appointment.revision,
                            }),
                          translate('appointmentMoved'),
                          false,
                        );
                      }}
                      aria-label={`${date} ${time}`}
                    />
                  ))}
                  {[
                    ...data.timeBlocks,
                    // Weekly blocks land on every matching weekday.
                    ...data.weeklyTimeBlocks
                      .filter((b) => b.weekday === new Date(`${date}T12:00:00Z`).getUTCDay())
                      .map((b) => ({
                        ...b,
                        startsAt: instant(date, b.startTime, data.clinic.timezone),
                        endsAt: instant(date, b.endTime, data.clinic.timezone),
                      })),
                  ]
                    .filter((b) => Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="calendar-block"
                        style={{
                          top:
                            ((Math.max(start, Date.parse(b.startsAt)) - start) / 1800000) *
                            ROW_HEIGHT,
                          height:
                            ((Math.min(end, Date.parse(b.endsAt)) -
                              Math.max(start, Date.parse(b.startsAt))) /
                              1800000) *
                            ROW_HEIGHT,
                        }}
                        title={b.reason || translate('clinicUnavailable')}
                      >
                        <span>{b.reason || translate('clinicUnavailable')}</span>
                      </div>
                    ))}
                  {events
                    .filter((a) => dateInClinic(a.scheduledAt!, data.clinic.timezone) === date)
                    .map((a) => (
                      <button
                        key={a.id}
                        className={`calendar-event ${a.plan?.source === 'ai-draft' ? 'draft' : ''}`}
                        draggable={!busy}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', a.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        style={{
                          top: ((Date.parse(a.scheduledAt!) - start) / 1800000) * ROW_HEIGHT,
                          height: Math.max(
                            1,
                            ((a.plan?.durationMinutes || 30) / 30) * ROW_HEIGHT - 3,
                          ),
                        }}
                        onClick={() =>
                          open(
                            translate('scheduledVisit'),
                            translate('reviewThePlanOrRescheduleUsingTheForm'),
                            <AppointmentDetail id={a.id} />,
                          )
                        }
                      >
                        <strong>{data.pets.find((p) => p.id === a.petId)?.name}</strong>
                        <span>
                          {timeLabel(a.scheduledAt!, data.clinic.timezone)} ·{' '}
                          {a.plan?.durationMinutes || 30}
                          {translate('min')}
                        </span>
                        {(a.plan?.durationMinutes || 30) >= 45 && (
                          <small>
                            {data.visitTypes.find((t) => t.id === a.plan?.visitTypeId)?.name ||
                              translate('notPlanned')}
                          </small>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="calendar-legend">
        <span>
          <i className="legend-visit" />
          {translate('confirmedVisit')}
        </span>
        <span>
          <i className="legend-block" />
          {translate('clinicUnavailable')}
        </span>
        <span className="muted">{translate('onTouchDevicesOpenAVisitAndChooseReschedule')}</span>
      </div>
    </>
  );
}
