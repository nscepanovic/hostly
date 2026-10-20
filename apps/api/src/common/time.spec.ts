import { DateTime } from 'luxon';
import { businessDateOf, businessDayWindow, parseDateTime, shiftAt, slotStart } from './time';

const settings = {
  timezone: 'Europe/Belgrade',
  dayStart: '06:00',
  openingHours: {
    '2': [
      { name: 'lunch', open: '09:00', close: '16:00' },
      { name: 'dinner', open: '16:00', close: '01:00' },
    ],
  },
};

describe('time helpers', () => {
  it('reads local times in the restaurant timezone and keeps explicit offsets', () => {
    expect(parseDateTime('2026-10-20T19:00', settings.timezone).toUTC().toISO()).toBe('2026-10-20T17:00:00.000Z');
    expect(parseDateTime('2026-10-20T17:00:00Z', settings.timezone).toFormat('HH:mm')).toBe('19:00');
  });

  it('runs the business day from dayStart to dayStart', () => {
    const { start, end } = businessDayWindow(settings, '2026-10-20');
    expect(start.toFormat('yyyy-LL-dd HH:mm')).toBe('2026-10-20 06:00');
    expect(end.toFormat('yyyy-LL-dd HH:mm')).toBe('2026-10-21 06:00');
  });

  it('assigns after-midnight times to the previous business day', () => {
    const late = DateTime.fromISO('2026-10-21T00:30', { zone: settings.timezone });
    expect(businessDateOf(settings, late)).toBe('2026-10-20');
  });

  it('finds shifts that cross midnight', () => {
    // Tuesday dinner runs until 01:00 on Wednesday.
    expect(shiftAt(settings, DateTime.fromISO('2026-10-21T00:30', { zone: settings.timezone }))?.name).toBe('dinner');
    expect(shiftAt(settings, DateTime.fromISO('2026-10-20T12:00', { zone: settings.timezone }))?.name).toBe('lunch');
    expect(shiftAt(settings, DateTime.fromISO('2026-10-20T08:00', { zone: settings.timezone }))).toBeNull();
    expect(shiftAt(settings, DateTime.fromISO('2026-10-21T01:00', { zone: settings.timezone }))).toBeNull();
  });

  it('floors to the slot grid', () => {
    expect(slotStart(DateTime.fromISO('2026-10-20T19:44', { zone: settings.timezone }), 15).toFormat('HH:mm')).toBe('19:30');
  });
});
