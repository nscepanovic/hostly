import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, ne, notInArray, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { CustomerType, SlotPace, TableSuggestion, ValidationIssue } from '@hostly/shared';
import type { DbOrTx } from '../db/client';
import { InjectDb, type Db } from '../db/db.module';
import { reservations, reservationTables, tableJoinGroups, tables, type RestaurantRow, type TableRow } from '../db/schema';
import { businessDayWindow, shiftAt, slotStart } from '../common/time';
import { suggestTables } from './suggest';

export interface TimeWindow {
  from: Date;
  to: Date;
}

/** Statuses counted for pacing (everything that is or was going to show up). */
const PACED_STATUSES = ['pending', 'confirmed', 'seated', 'completed'] as const;

@Injectable()
export class AvailabilityService {
  constructor(@InjectDb() private readonly db: Db) {}

  /** Table ids held by another active reservation overlapping the window. */
  async busyTableIds(restaurantId: string, window: TimeWindow, excludeReservationId?: string, tx: DbOrTx = this.db): Promise<Set<string>> {
    const rows = await tx
      .selectDistinct({ id: reservationTables.tableId })
      .from(reservationTables)
      .where(
        and(
          eq(reservationTables.restaurantId, restaurantId),
          eq(reservationTables.active, true),
          sql`${reservationTables.during} && tstzrange(${window.from.toISOString()}::timestamptz, ${window.to.toISOString()}::timestamptz, '[)')`,
          excludeReservationId ? ne(reservationTables.reservationId, excludeReservationId) : undefined,
        ),
      );
    return new Set(rows.map((r) => r.id));
  }

  /**
   * The single source of truth for availability: active tables free for the whole
   * window, and the subset that fits the party on its own.
   */
  async getFreeTables(
    restaurantId: string,
    window: TimeWindow,
    covers: number,
    opts: { excludeReservationId?: string; tx?: DbOrTx } = {},
  ): Promise<{ free: TableRow[]; fitting: TableRow[] }> {
    const tx = opts.tx ?? this.db;
    const [all, busy] = await Promise.all([
      tx.select().from(tables).where(and(eq(tables.restaurantId, restaurantId), eq(tables.active, true))),
      this.busyTableIds(restaurantId, window, opts.excludeReservationId, tx),
    ]);
    const free = all.filter((t) => !busy.has(t.id));
    return { free, fitting: free.filter((t) => t.minSeats <= covers && covers <= t.maxSeats) };
  }

  async suggest(
    restaurantId: string,
    window: TimeWindow,
    covers: number,
    opts: { customerType?: CustomerType | null; areaId?: string | null; excludeReservationId?: string; limit?: number } = {},
  ): Promise<TableSuggestion[]> {
    const [{ free }, groups] = await Promise.all([
      this.getFreeTables(restaurantId, window, covers, { excludeReservationId: opts.excludeReservationId }),
      this.db.select().from(tableJoinGroups).where(eq(tableJoinGroups.restaurantId, restaurantId)),
    ]);
    return suggestTables(free, groups, covers, opts);
  }

  /** Reservations and covers starting in the slot that contains `at`. */
  async slotLoad(restaurant: RestaurantRow, at: DateTime, excludeReservationId?: string, tx: DbOrTx = this.db) {
    const start = slotStart(at.setZone(restaurant.timezone), restaurant.slotMinutes);
    const end = start.plus({ minutes: restaurant.slotMinutes });
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int`, covers: sql<number>`coalesce(sum(${reservations.covers}), 0)::int` })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurant.id),
          inArray(reservations.status, [...PACED_STATUSES]),
          gte(reservations.arrivalAt, start.toJSDate()),
          lt(reservations.arrivalAt, end.toJSDate()),
          excludeReservationId ? ne(reservations.id, excludeReservationId) : undefined,
        ),
      );
    return row;
  }

  /**
   * Checks a reservation against opening hours, party size, pacing and table
   * availability. Soft issues can be overridden by staff; hard ones cannot.
   */
  async validate(
    restaurant: RestaurantRow,
    input: { arrival: DateTime; departure: DateTime; covers: number; tableIds: string[]; excludeReservationId?: string; checkPast?: boolean },
    tx: DbOrTx = this.db,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    if (!shiftAt(restaurant, input.arrival)) issues.push({ code: 'closed', message: 'Outside opening hours', hard: false });
    if (input.covers > restaurant.maxPartySize) {
      issues.push({ code: 'max_party_size', message: `Max party size is ${restaurant.maxPartySize}`, hard: false });
    }
    if (input.checkPast && input.arrival < DateTime.now().minus({ minutes: 15 })) {
      issues.push({ code: 'past', message: 'Arrival is in the past', hard: false });
    }

    const { pacingMaxReservationsPerSlot: maxRes, pacingMaxCoversPerSlot: maxCovers } = restaurant;
    if (maxRes !== null || maxCovers !== null) {
      const load = await this.slotLoad(restaurant, input.arrival, input.excludeReservationId, tx);
      if (maxRes !== null && load.count + 1 > maxRes) {
        issues.push({ code: 'pacing_reservations', message: `${load.count}/${maxRes} reservations already start in this slot`, hard: false });
      }
      if (maxCovers !== null && load.covers + input.covers > maxCovers) {
        issues.push({ code: 'pacing_covers', message: `${load.covers}/${maxCovers} covers already start in this slot`, hard: false });
      }
    }

    if (input.tableIds.length) {
      const window = { from: input.arrival.toJSDate(), to: input.departure.toJSDate() };
      const [busy, chosen] = await Promise.all([
        this.busyTableIds(restaurant.id, window, input.excludeReservationId, tx),
        tx
          .select()
          .from(tables)
          .where(and(eq(tables.restaurantId, restaurant.id), inArray(tables.id, input.tableIds))),
      ]);
      const conflicts = chosen.filter((t) => busy.has(t.id));
      if (conflicts.length) {
        issues.push({ code: 'table_conflict', message: `Already booked: ${conflicts.map((t) => t.label).join(', ')}`, hard: true });
      }
      const seats = chosen.reduce((n, t) => n + t.maxSeats, 0);
      if (seats < input.covers) issues.push({ code: 'table_capacity', message: `Tables seat ${seats}`, hard: false });
    }
    return issues;
  }

  /** Per-slot reservation and cover counts for a business day (timeline header). */
  async pace(restaurant: RestaurantRow, date: string): Promise<SlotPace[]> {
    const { start, end } = businessDayWindow(restaurant, date);
    const rows = await this.db
      .select({ arrivalAt: reservations.arrivalAt, covers: reservations.covers })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurant.id),
          notInArray(reservations.status, ['cancelled', 'no_show']),
          gte(reservations.arrivalAt, start.toJSDate()),
          lt(reservations.arrivalAt, end.toJSDate()),
        ),
      );
    const slots = new Map<string, SlotPace>();
    for (const r of rows) {
      const at = slotStart(DateTime.fromJSDate(r.arrivalAt).setZone(restaurant.timezone), restaurant.slotMinutes).toUTC().toISO()!;
      const s = slots.get(at) ?? { at, reservations: 0, covers: 0 };
      s.reservations += 1;
      s.covers += r.covers;
      slots.set(at, s);
    }
    return [...slots.values()].sort((a, b) => a.at.localeCompare(b.at));
  }
}
