'use client';
import { useTranslations } from 'next-intl';
import type { Appointment } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { dateInClinic, instant, timeLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function RescheduleForm({ appointment }: { appointment: Appointment }) {
  const translate = useTranslations('clinic');
  const { data, run, busy } = useVet();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        void run(
          () =>
            api(`appointments/${appointment.id}/reschedule`, {
              scheduledAt: instant(v.date, v.time, data.clinic.timezone),
              revision: appointment.revision,
            }),
          translate('appointmentMoved'),
        );
      }}
    >
      <div className="form-grid">
        <Field label={translate('day')}>
          <input
            name="date"
            type="date"
            required
            defaultValue={dateInClinic(appointment.scheduledAt!, data.clinic.timezone)}
          />
        </Field>
        <Field label={translate('time')} hint={data.clinic.timezone}>
          <input
            name="time"
            type="time"
            step={1800}
            required
            defaultValue={timeLabel(appointment.scheduledAt!, data.clinic.timezone)}
          />
        </Field>
      </div>
      <Button type="submit" disabled={busy}>
        {translate('moveAppointment')}
      </Button>
    </form>
  );
}
