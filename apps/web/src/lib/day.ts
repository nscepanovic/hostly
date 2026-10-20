import { useMemo } from 'react';
import { DateTime } from 'luxon';
import { hhmmToMinutes, type ReservationDto, type RestaurantDto } from '@hostly/shared';
import { useUi } from '@/store/ui';
import { useReservations, useRestaurant, useViewDate } from './queries';

export interface ShiftOption {
  name: string;
  start: DateTime;
  end: DateTime;
}

/** Shift windows for a business date, from the restaurant's opening hours. */
export function shiftsFor(r: RestaurantDto, date: string): ShiftOption[] {
  const day = DateTime.fromISO(date, { zone: r.timezone }).startOf('day');
  const key = String(day.weekday) as keyof RestaurantDto['openingHours'];
  return (r.openingHours[key] ?? []).map((s) => {
    const open = hhmmToMinutes(s.open);
    let close = hhmmToMinutes(s.close);
    if (close <= open) close += 1440;
    return { name: s.name, start: day.plus({ minutes: open }), end: day.plus({ minutes: close }) };
  });
}

export const isActive = (r: ReservationDto) => r.status === 'pending' || r.status === 'confirmed' || r.status === 'seated';
export const isLive = (r: ReservationDto) => r.status !== 'cancelled' && r.status !== 'no_show';

/** Reservations of the viewed day filtered by the selected shift. */
export function useDayReservations() {
  const date = useViewDate();
  const shift = useUi((s) => s.shift);
  const { data: restaurant } = useRestaurant();
  const query = useReservations(date);
  const shifts = useMemo(() => (restaurant && date ? shiftsFor(restaurant, date) : []), [restaurant, date]);
  const filtered = useMemo(() => {
    const all = query.data ?? [];
    const win = shifts.find((s) => s.name === shift);
    if (!win) return all;
    return all.filter((r) => {
      const at = DateTime.fromISO(r.arrivalAt);
      return at >= win.start && at < win.end;
    });
  }, [query.data, shifts, shift]);
  const summary = useMemo(() => {
    const live = filtered.filter(isLive);
    return {
      reservations: live.length,
      covers: live.reduce((n, r) => n + r.covers, 0),
      withoutTable: filtered.filter((r) => isActive(r) && r.tableIds.length === 0).length,
    };
  }, [filtered]);
  return { date, restaurant, shifts, reservations: filtered, all: query.data ?? [], summary, query };
}

export const guestName = (r: Pick<ReservationDto, 'firstName' | 'lastName'>) =>
  [r.lastName, r.firstName].filter(Boolean).join(' ') || '—';
