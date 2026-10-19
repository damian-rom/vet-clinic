import { CLINIC_CONFIG } from '@vet-clinic/config';
import type { ClinicSettings } from '@vet-clinic/types';

export function clinicSettings(
  timezone = process.env.CLINIC_TIMEZONE || 'America/Havana',
): ClinicSettings {
  new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  return { ...CLINIC_CONFIG, timezone };
}
export function localParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (k: string) => parts.find((p) => p.type === k)!.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}
export function clinicInstant(
  date: string,
  hour: number,
  minute: number,
  timezone: string,
): string {
  const target = Date.parse(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess).toISOString(), timezone);
    const actual = Date.parse(
      `${p.date}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00Z`,
    );
    if (actual === target) return new Date(guess).toISOString();
    guess += target - actual;
  }
  throw new Error('This local time does not exist in the clinic timezone');
}
export const endOf = (start: string, minutes: number) => Date.parse(start) + minutes * 60_000;
export const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
/** The clinic-local date `n` days after `date`. */
const nextDate = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
/** Each weekly block's concrete occurrences that overlap [from, to). */
export function weeklyOccurrences(
  blocks: { weekday: number; startTime: string; endTime: string }[],
  from: number,
  to: number,
  timezone: string,
): { start: number; end: number }[] {
  const occurrences: { start: number; end: number }[] = [];
  if (!blocks.length) return occurrences;
  const at = (date: string, time: string) =>
    Date.parse(clinicInstant(date, Number(time.slice(0, 2)), Number(time.slice(3)), timezone));
  const last = localParts(new Date(to).toISOString(), timezone).date;
  for (
    let date = localParts(new Date(from).toISOString(), timezone).date;
    date <= last;
    date = nextDate(date, 1)
  ) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const block of blocks.filter((b) => b.weekday === weekday)) {
      const start = at(date, block.startTime);
      const end = at(date, block.endTime);
      if (overlaps(start, end, from, to)) occurrences.push({ start, end });
    }
  }
  return occurrences;
}
