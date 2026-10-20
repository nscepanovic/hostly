import type { ReservationDto } from '@hostly/shared';

export type TableState = 'free' | 'reserved' | 'pending' | 'seated' | 'completed' | 'attention';

export interface TableStatus {
  state: TableState;
  /** The reservation the table shows (seated one, else the next upcoming). */
  reservation: ReservationDto | null;
  /** Further upcoming reservations later in the day. */
  upcoming: ReservationDto[];
}

/** Minutes after arrival before an unseated confirmed reservation needs attention. */
export const LATE_GRACE_MIN = 10;

/**
 * Derives each table's state for the viewed day. `now` is only meaningful when the
 * viewed day is today; for other days pass null and tables show their first booking.
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
    const seated = list.find((r) => r.status === 'seated');
    const open = list.filter((r) => r.status === 'confirmed' || r.status === 'pending');
    const nowMs = now?.getTime();
    // Bookings whose window already ended without anyone seated are not "upcoming".
    const upcoming = nowMs === undefined ? open : open.filter((r) => new Date(r.departureAt).getTime() > nowMs);

    if (seated) {
      result.set(tableId, { state: 'seated', reservation: seated, upcoming: upcoming.filter((r) => r.id !== seated.id) });
      continue;
    }
    const next = upcoming[0];
    if (next) {
      const late = nowMs !== undefined && next.status === 'confirmed' && new Date(next.arrivalAt).getTime() + LATE_GRACE_MIN * 60_000 < nowMs;
      result.set(tableId, {
        state: late ? 'attention' : next.status === 'pending' ? 'pending' : 'reserved',
        reservation: next,
        upcoming: upcoming.slice(1),
      });
      continue;
    }
    const lastCompleted = [...list].reverse().find((r) => r.status === 'completed');
    // A recently completed table stays grey briefly so staff can see it needs clearing.
    const recentlyCompleted =
      lastCompleted && nowMs !== undefined && lastCompleted.completedAt && nowMs - new Date(lastCompleted.completedAt).getTime() < 15 * 60_000;
    result.set(tableId, {
      state: recentlyCompleted ? 'completed' : 'free',
      reservation: recentlyCompleted ? lastCompleted : null,
      upcoming: [],
    });
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
