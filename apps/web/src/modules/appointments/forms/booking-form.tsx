'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { OwnerAppointment } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { timeLabel, today } from '@/lib/time';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useOwner } from '@/components/context';
export function BookingForm({
  appointment,
  petId,
}: {
  appointment?: OwnerAppointment;
  petId?: string;
}) {
  const translate = useTranslations('clinic');
  const { data, busy, run } = useOwner();
  const [date, setDate] = useState(today(data.clinic));
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const appointmentId = appointment?.id;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSlot('');
    setError('');
    void api<{
      slots: string[];
    }>(`slots?date=${date}${appointmentId ? `&appointmentId=${appointmentId}` : ''}`)
      .then((r) => {
        if (!cancelled) setSlots(r.slots);
      })
      .catch((e) => {
        if (!cancelled) {
          setSlots([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, appointmentId]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        void run(
          () =>
            api(
              appointment ? `appointments/${appointment.id}/pick-time` : 'appointments',
              appointment
                ? { scheduledAt: slot }
                : { petId: v.petId, symptoms: v.symptoms, scheduledAt: slot },
            ),
          translate('timeRequestedTheClinicWillConfirmYourVisit'),
        );
      }}
    >
      {!appointment ? (
        <>
          <Field label={translate('whoIsComingIn')}>
            <select name="petId" defaultValue={petId || data.pets[0]?.id} required>
              {data.pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.species}
                </option>
              ))}
            </select>
          </Field>
          <Field label={translate('whatSGoingOn')}>
            <textarea
              name="symptoms"
              required
              maxLength={4000}
              placeholder={translate('tellUsWhatYouVeNoticedOrWhyYouDLikeTo')}
            />
          </Field>
        </>
      ) : (
        <div className="info-box">
          <strong>{data.pets.find((p) => p.id === appointment.petId)?.name}</strong>
          <p>{appointment.symptoms}</p>
        </div>
      )}
      <Field
        label={translate('chooseADay')}
        hint={translate('clinicTimeValue0', { value0: data.clinic.timezone ?? '' })}
      >
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={today(data.clinic)}
          required
        />
      </Field>
      <fieldset className="slot-fieldset">
        <legend>{translate('availableTimes')}</legend>
        {loading ? (
          <p className="muted" role="status">
            {translate('findingOpenTimes')}
          </p>
        ) : error ? (
          <p role="alert" className="notice error">
            {error}
          </p>
        ) : slots.length ? (
          <div className="slots">
            {slots.map((s) => (
              <button
                type="button"
                key={s}
                className={slot === s ? 'selected' : ''}
                aria-pressed={slot === s}
                onClick={() => setSlot(s)}
              >
                {timeLabel(s, data.clinic.timezone)}
              </button>
            ))}
          </div>
        ) : (
          <p className="info-box">{translate('noOpenTimesOnThisDayChooseAnotherWeekday')}</p>
        )}
      </fieldset>
      <p className="muted small">
        {translate('yourAppointmentIsConfirmedAfterAVeterinarianTakesItOn')}
      </p>
      <Button type="submit" disabled={busy || !slot || loading}>
        {busy
          ? translate('requesting')
          : appointment
            ? translate('chooseThisTime')
            : translate('requestAppointment')}
        <ArrowRight size={16} />
      </Button>
    </form>
  );
}
