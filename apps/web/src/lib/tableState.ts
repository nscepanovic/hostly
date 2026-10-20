import type { ReservationDto } from '@hostly/shared';

export type TableState = 'free' | 'reserved' | 'pending' | 'seated' | 'completed' | 'attention';

export interface TableStatus {
  state: TableState;
  /** The reservation shown on the table: the seated party, else the imminent or late one. */
  reservation: ReservationDto | null;
  /** Later reservations today, in order (what is coming next). */
  upcoming: ReservationDto[];
  /** The table is free now but booked from this time (ISO). */
  freeUntil: string | null;
}

/** Minutes after arrival before an unseated confirmed reservation needs attention. */
export const LATE_GRACE_MIN = 10;
/** A table shows as reserved only this long before its next booking; earlier it is free (until then). */
export const RESERVED_LEAD_MIN = 60;

/**
 * Derives each table's state for the viewed day. `now` is only meaningful when the
 * viewed day is today; for other days pass null and tables show their first booking.
 * One table can hold many reservations a day: the next ones are listed in `upcoming`.
 */
export function computeTableStatuses(reservations: ReservationDto[], now: Date | null): Map<string, TableStatus> {
  const byTable = new Map<string, ReservationDto[]>();
  for (const r of reservations) {
    if (r.status === 'cancelled' || r.status === 'no_show') continue;
    for (const id of r.tableIds) {
      const list = byTable.get(id) ?? [];
      list.push(r);
      byTable.set(id, list);
    }
  }

  const result = new Map<string, TableStatus>();
  for (const [tableId, list] of byTable) {
    list.sort((a, b) => a.arrivalAt.localeCompare(b.arrivalAt));
    const nowMs = now?.getTime();
    const open = list.filter((r) => r.status === 'confirmed' || r.status === 'pending');
    // Bookings whose window already ended without anyone seated are not "upcoming".
    const ahead = nowMs === undefined ? open : open.filter((r) => new Date(r.departureAt).getTime() > nowMs);
    const seated = list.find((r) => r.status === 'seated');

    if (seated) {
      result.set(tableId, { state: 'seated', reservation: seated, upcoming: ahead.filter((r) => r.id !== seated.id), freeUntil: null });
      continue;
    }

    const next = ahead[0];
    const lastCompleted = [...list].reverse().find((r) => r.status === 'completed');
    // A just-completed table stays grey briefly so staff can see it needs clearing.
    const recentlyCompleted =
      nowMs !== undefined && lastCompleted?.completedAt && nowMs - new Date(lastCompleted.completedAt).getTime() < 15 * 60_000 ? lastCompleted : null;

    if (next) {
      const arrival = new Date(next.arrivalAt).getTime();
      const late = nowMs !== undefined && next.status === 'confirmed' && arrival + LATE_GRACE_MIN * 60_000 < nowMs;
      const imminent = nowMs === undefined || arrival - nowMs <= RESERVED_LEAD_MIN * 60_000;
      if (late || imminent) {
        result.set(tableId, {
          state: late ? 'attention' : next.status === 'pending' ? 'pending' : 'reserved',
          reservation: next,
          upcoming: ahead.slice(1),
          freeUntil: null,
        });
        continue;
      }
      // Free for now: the next booking is more than an hour away.
      result.set(tableId, {
        state: recentlyCompleted ? 'completed' : 'free',
        reservation: recentlyCompleted,
        upcoming: ahead,
        freeUntil: next.arrivalAt,
      });
      continue;
    }

    result.set(tableId, { state: recentlyCompleted ? 'completed' : 'free', reservation: recentlyCompleted, upcoming: [], freeUntil: null });
  }
  return result;
}

export const STATE_FILL: Record<TableState, string> = {
  free: 'var(--color-st-free)',
  reserved: 'var(--color-st-reserved)',
  pending: 'var(--color-st-pending)',
  seated: 'var(--color-st-seated)',
  completed: 'var(--color-st-completed)',
  attention: 'var(--color-st-attention)',
};
