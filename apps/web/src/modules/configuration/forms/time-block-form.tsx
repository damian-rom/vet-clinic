'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api';
import { addDays, instant, weekdayLabel, WEEKDAYS } from '@/lib/time';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function BlockForm() {
  const translate = useTranslations('clinic');
  const { data, run, busy } = useVet();
  const locale = useLocale();
  const [wholeDay, setWholeDay] = useState(false);
  const [weekly, setWeekly] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        const reason = v.reason ? { reason: v.reason } : {};
        if (weekly) {
          void run(
            () =>
              api('weekly-time-blocks', {
                weekday: Number(v.weekday),
                startTime: v.startTime,
                endTime: v.endTime,
                ...reason,
              }),
            translate('clinicTimeBlockedEveryWeek'),
          );
          return;
        }
        const startsAt = instant(
          v.startDate,
          wholeDay ? '00:00' : v.startTime,
          data.clinic.timezone,
        );
        const endsAt = instant(
          wholeDay ? addDays(v.endDate || v.startDate, 1) : v.endDate,
          wholeDay ? '00:00' : v.endTime,
          data.clinic.timezone,
        );
        void run(
          () => api('time-blocks', { startsAt, endsAt, ...reason }),
          translate('clinicTimeBlocked'),
        );
      }}
    >
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={weekly}
          onChange={(e) => {
            setWeekly(e.target.checked);
            setWholeDay(false);
          }}
        />
        {translate('repeatEveryWeek')}
      </label>
      {!weekly && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={wholeDay}
            onChange={(e) => setWholeDay(e.target.checked)}
          />
          {translate('blockWholeDays')}
        </label>
      )}
      {weekly ? (
        <Field label={translate('dayOfTheWeek')}>
          <select name="weekday" defaultValue="1" required>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {weekdayLabel(d, locale)}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="form-grid">
          <Field label={translate('startDay')}>
            <input name="startDate" type="date" required />
          </Field>
          <Field label={wholeDay ? translate('lastDayInclusive') : translate('endDay')}>
            <input name="endDate" type="date" required />
          </Field>
        </div>
      )}
      {!wholeDay && (
        <div className="form-grid">
          <Field label={translate('startTime')}>
            <input name="startTime" type="time" required />
          </Field>
          <Field label={translate('endTime')}>
            <input name="endTime" type="time" required />
          </Field>
        </div>
      )}
      <Field
        label={translate('reasonOptional')}
        hint={translate('allTimesUseValue0', { value0: data.clinic.timezone ?? '' })}
      >
        <input name="reason" placeholder={translate('holidayLunchOrEmergency')} maxLength={1000} />
      </Field>
      <p className="info-box">
        {translate('blocksCannotOverlapExistingAppointmentsAskOwnersForNewTimesFirstIf')}
      </p>
      <Button disabled={busy} type="submit">
        {translate('createTimeBlock')}
      </Button>
    </form>
  );
}
