import type { ClinicSettings } from '@vet-clinic/types';
const displayLocale = () =>
  typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';
export const dateInClinic = (iso: string, timezone: string) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (k: string) => p.find((v) => v.type === k)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
export function instant(date: string, time: string, timezone: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (k: string) => p.find((v) => v.type === k)!.value;
    const actual = Date.parse(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00Z`,
    );
    if (actual === target) return new Date(guess).toISOString();
    guess += target - actual;
  }
  throw new Error('This time does not exist in the clinic timezone');
}
export const timeLabel = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat(displayLocale(), {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
export const dateLabel = (iso?: string, timezone = 'America/Havana') =>
  iso
    ? new Intl.DateTimeFormat(displayLocale(), {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso))
    : displayLocale() === 'es'
      ? 'Pendiente de hora'
      : 'Waiting for a time';
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const today = (c: ClinicSettings) => dateInClinic(new Date().toISOString(), c.timezone);
/** The weekday's name, 0 = Sunday … 6 = Saturday. */
export const weekdayLabel = (weekday: number, locale: string) =>
  new Date(Date.UTC(2030, 0, 6 + weekday)).toLocaleDateString(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  });
/** Weekdays in display order, Monday first. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
