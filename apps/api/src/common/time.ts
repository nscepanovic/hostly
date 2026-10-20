import { DateTime } from 'luxon';
import { hhmmToMinutes, type OpeningHours } from '@hostly/shared';

export interface ShiftWindow {
  name: string;
  start: DateTime;
  end: DateTime;
}

interface TimeSettings {
  timezone: string;
  dayStart: string;
  openingHours: OpeningHours;
}

/** Parses an ISO string with offset, or a local "YYYY-MM-DDTHH:mm" in the restaurant timezone. */
export function parseDateTime(value: string, timezone: string): DateTime {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const dt = hasZone ? DateTime.fromISO(value, { setZone: true }).setZone(timezone) : DateTime.fromISO(value, { zone: timezone });
  if (!dt.isValid) throw new Error(`Invalid date: ${value}`);
  return dt;
}

/** Start of the business day ("All day" runs dayStart .. dayStart + 24h). */
export function businessDayStart(settings: Pick<TimeSettings, 'timezone' | 'dayStart'>, date: string): DateTime {
  const mins = hhmmToMinutes(settings.dayStart);
  return DateTime.fromISO(date, { zone: settings.timezone }).startOf('day').plus({ minutes: mins });
}

export function businessDayWindow(settings: Pick<TimeSettings, 'timezone' | 'dayStart'>, date: string) {
  const start = businessDayStart(settings, date);
  return { start, end: start.plus({ days: 1 }) };
}

/** The business date (YYYY-MM-DD) a moment belongs to. */
export function businessDateOf(settings: Pick<TimeSettings, 'timezone' | 'dayStart'>, at: DateTime): string {
  const local = at.setZone(settings.timezone);
  const mins = local.hour * 60 + local.minute;
  return (mins < hhmmToMinutes(settings.dayStart) ? local.minus({ days: 1 }) : local).toISODate()!;
}

/** Concrete shift windows for a calendar date; shifts closing at/before opening run past midnight. */
export function shiftsForDate(settings: TimeSettings, date: string): ShiftWindow[] {
  const day = DateTime.fromISO(date, { zone: settings.timezone }).startOf('day');
  const weekday = String(day.weekday) as keyof OpeningHours;
  return (settings.openingHours[weekday] ?? []).map((s) => {
    const open = hhmmToMinutes(s.open);
    let close = hhmmToMinutes(s.close);
    if (close <= open) close += 24 * 60;
    return { name: s.name, start: day.plus({ minutes: open }), end: day.plus({ minutes: close }) };
  });
}

/** The shift containing `at` (checks the previous calendar day too, for after-midnight shifts). */
export function shiftAt(settings: TimeSettings, at: DateTime): ShiftWindow | null {
  const local = at.setZone(settings.timezone);
  for (const date of [local.toISODate()!, local.minus({ days: 1 }).toISODate()!]) {
    const hit = shiftsForDate(settings, date).find((s) => local >= s.start && local < s.end);
    if (hit) return hit;
  }
  return null;
}

/** Floors a moment to the slot grid (slots are aligned to the hour). */
export function slotStart(at: DateTime, slotMinutes: number): DateTime {
  const m = Math.floor(at.minute / slotMinutes) * slotMinutes;
  return at.set({ minute: m, second: 0, millisecond: 0 });
}

export const toIso = (d: Date | DateTime) => (d instanceof Date ? d.toISOString() : d.toUTC().toISO()!);
