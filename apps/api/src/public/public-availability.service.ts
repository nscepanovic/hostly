import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { durationForCovers, type PublicSlot, type TableSuggestion } from '@hostly/shared';
import { shiftsForDate, type ShiftWindow } from '../common/time';
import { InjectDb, type Db } from '../db/db.module';
import { reservations, tableJoinGroups, type RestaurantRow } from '../db/schema';
import { AvailabilityService } from '../reservations/availability.service';
import { suggestTables } from '../reservations/suggest';

export interface SlotCheck {
  ok: boolean;
  reason?: 'disabled' | 'party_size' | 'blocked' | 'out_of_range' | 'lead_time' | 'closed' | 'pacing' | 'shift_capacity' | 'no_table';
  suggestion?: TableSuggestion;
  arrival?: DateTime;
  departure?: DateTime;
}

/** Online-widget availability: the restaurant's online rules on top of getFreeTables. */
@Injectable()
export class PublicAvailabilityService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly availability: AvailabilityService,
  ) {}

  /** Date-level rules shared by every slot of the day. */
  private dayCheck(r: RestaurantRow, date: string, covers: number): SlotCheck | null {
    const o = r.onlineSettings;
    if (!o.enabled) return { ok: false, reason: 'disabled' };
    if (covers > o.maxPartySize || covers > r.maxPartySize) return { ok: false, reason: 'party_size' };
    if (o.blockedDates.includes(date)) return { ok: false, reason: 'blocked' };
    const today = DateTime.now().setZone(r.timezone).startOf('day');
    const day = DateTime.fromISO(date, { zone: r.timezone });
    if (day < today || day > today.plus({ days: o.daysAhead })) return { ok: false, reason: 'out_of_range' };
    return null;
  }

  /** Arrival times the widget offers for a date: shift start until close minus last-arrival buffer. */
  candidateTimes(r: RestaurantRow, date: string): Array<{ at: DateTime; shift: ShiftWindow }> {
    const o = r.onlineSettings;
    const out: Array<{ at: DateTime; shift: ShiftWindow }> = [];
    for (const shift of shiftsForDate(r, date)) {
      const last = shift.end.minus({ minutes: o.lastArrivalBeforeCloseMinutes });
      for (let at = shift.start; at <= last; at = at.plus({ minutes: o.slotMinutes })) {
        if (at >= shift.end) break;
        out.push({ at, shift });
      }
    }
    return out;
  }

  private async shiftCovers(r: RestaurantRow, shift: ShiftWindow): Promise<number> {
    const [row] = await this.db
      .select({ covers: sql<number>`coalesce(sum(${reservations.covers}), 0)::int` })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, r.id),
          eq(reservations.source, 'online'),
          inArray(reservations.status, ['pending', 'confirmed', 'seated', 'completed']),
          gte(reservations.arrivalAt, shift.start.toJSDate()),
          lt(reservations.arrivalAt, shift.end.toJSDate()),
        ),
      );
    return row.covers;
  }

  /** Checks one arrival time against lead time, pacing, shift capacity and free tables. */
  async checkSlot(r: RestaurantRow, at: DateTime, shift: ShiftWindow, covers: number, shiftCoversCache?: Map<string, number>): Promise<SlotCheck> {
    const o = r.onlineSettings;
    if (at < DateTime.now().plus({ minutes: o.leadTimeMinutes })) return { ok: false, reason: 'lead_time' };

    const maxRes = o.pacingMaxReservationsPerSlot ?? r.pacingMaxReservationsPerSlot;
    const maxCovers = o.pacingMaxCoversPerSlot ?? r.pacingMaxCoversPerSlot;
    if (maxRes !== null || maxCovers !== null) {
      const load = await this.availability.slotLoad(r, at);
      if ((maxRes !== null && load.count + 1 > maxRes) || (maxCovers !== null && load.covers + covers > maxCovers)) {
        return { ok: false, reason: 'pacing' };
      }
    }

    const cap = o.shiftCapacity[shift.name];
    if (cap !== undefined) {
      const key = shift.start.toISO()!;
      let used = shiftCoversCache?.get(key);
      if (used === undefined) {
        used = await this.shiftCovers(r, shift);
        shiftCoversCache?.set(key, used);
      }
      if (used + covers > cap) return { ok: false, reason: 'shift_capacity' };
    }

    const departure = at.plus({ minutes: durationForCovers(o.durations, covers, r.defaultDurationMin) });
    const [{ free }, groups] = await Promise.all([
      this.availability.getFreeTables(r.id, { from: at.toJSDate(), to: departure.toJSDate() }, covers),
      this.db.select().from(tableJoinGroups).where(eq(tableJoinGroups.restaurantId, r.id)),
    ]);
    // Online guests only get single tables or predefined combinations; ad hoc joins stay a staff decision.
    const suggestion = suggestTables(free, groups, covers, { limit: 1, adjacency: -1 })[0];
    if (!suggestion) return { ok: false, reason: 'no_table' };
    return { ok: true, suggestion, arrival: at, departure };
  }

  async slots(r: RestaurantRow, date: string, covers: number): Promise<PublicSlot[]> {
    const blocked = this.dayCheck(r, date, covers);
    const times = this.candidateTimes(r, date);
    if (blocked) return times.map(({ at }) => ({ time: at.toFormat('HH:mm'), available: false }));
    const cache = new Map<string, number>();
    const out: PublicSlot[] = [];
    for (const { at, shift } of times) {
      const check = await this.checkSlot(r, at, shift, covers, cache);
      out.push({ time: at.toFormat('HH:mm'), available: check.ok });
    }
    return out;
  }

  /** Validates a requested date + time for booking. */
  async checkRequest(r: RestaurantRow, date: string, time: string, covers: number): Promise<SlotCheck> {
    const blocked = this.dayCheck(r, date, covers);
    if (blocked) return blocked;
    const match = this.candidateTimes(r, date).find(({ at }) => at.toFormat('HH:mm') === time);
    if (!match) return { ok: false, reason: 'closed' };
    return this.checkSlot(r, match.at, match.shift, covers);
  }
}
