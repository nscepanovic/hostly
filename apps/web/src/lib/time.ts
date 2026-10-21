import { DateTime } from 'luxon';
import { FALLBACK_LANGUAGE, hhmmToMinutes, isLanguage, LANGUAGE_INFO, type RestaurantDto } from '@hostly/shared';

type TimeSettings = Pick<RestaurantDto, 'timezone' | 'dayStart'>;

/** Business date (YYYY-MM-DD) for "now"; before dayStart counts as the previous day. */
export function todayBusinessDate(r: TimeSettings): string {
  const now = DateTime.now().setZone(r.timezone);
  const mins = now.hour * 60 + now.minute;
  return (mins < hhmmToMinutes(r.dayStart) ? now.minus({ days: 1 }) : now).toISODate()!;
}

export function dayWindow(r: TimeSettings, date: string) {
  const start = DateTime.fromISO(date, { zone: r.timezone }).startOf('day').plus({ minutes: hhmmToMinutes(r.dayStart) });
  return { start, end: start.plus({ days: 1 }) };
}

export const inZone = (iso: string, tz: string) => DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz);
export const fmtTime = (iso: string, tz: string) => inZone(iso, tz).toFormat('HH:mm');
/** Short date in the UI language's own format, e.g. "pet 23.10.2026" / "Fri 23/10/2026". */
export const fmtDate = (date: string, lang: string) => {
  const info = langInfo(lang);
  return DateTime.fromISO(date).setLocale(info.locale).toFormat(info.dateShort);
};
export const fmtDateTime = (iso: string, tz: string, lang: string) => {
  const info = langInfo(lang);
  return inZone(iso, tz).setLocale(info.locale).toFormat(`${info.dateShort} HH:mm`);
};

export const shiftDate = (date: string, days: number) => DateTime.fromISO(date).plus({ days }).toISODate()!;

/** Local "YYYY-MM-DDTHH:mm" in the restaurant timezone, as the API accepts. */
export const localDateTime = (date: string, time: string) => `${date}T${time}`;

/** Calendar date + time for a business date: times before dayStart belong to the next calendar day. */
export function businessLocal(r: TimeSettings, date: string, time: string): string {
  const cal = hhmmToMinutes(time) < hhmmToMinutes(r.dayStart) ? shiftDate(date, 1) : date;
  return localDateTime(cal, time);
}

/** Date formats and locale of a UI language (unknown codes use the fallback language). */
export const langInfo = (lang: string) => LANGUAGE_INFO[isLanguage(lang) ? lang : FALLBACK_LANGUAGE];
