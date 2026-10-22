import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { normalizePhone, type WaitingEntryDto, type WaitingEntryInput, type WaitingStatus } from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { tables, waitingEntries, type WaitingRow } from '../db/schema';
import { PushService } from '../push/push.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { AvailabilityService } from '../reservations/availability.service';

export const toWaitingDto = (w: WaitingRow): WaitingEntryDto => ({
  id: w.id,
  guestName: w.guestName,
  phone: w.phone,
  covers: w.covers,
  notes: w.notes,
  status: w.status,
  createdAt: w.createdAt.toISOString(),
  notifiedAt: w.notifiedAt?.toISOString() ?? null,
});

@Injectable()
export class WaitingService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly restaurants: RestaurantService,
    private readonly availability: AvailabilityService,
    private readonly push: PushService,
  ) {}

  async list(restaurantId: string): Promise<WaitingEntryDto[]> {
    const rows = await this.db
      .select()
      .from(waitingEntries)
      .where(and(eq(waitingEntries.restaurantId, restaurantId), eq(waitingEntries.status, 'waiting')))
      .orderBy(asc(waitingEntries.createdAt));
    return rows.map(toWaitingDto);
  }

  async create(restaurantId: string, input: WaitingEntryInput): Promise<WaitingEntryDto> {
    const [row] = await this.db
      .insert(waitingEntries)
      .values({ restaurantId, ...input, phone: normalizePhone(input.phone) ?? input.phone })
      .returning();
    const dto = toWaitingDto(row);
    this.realtime.emit(restaurantId, 'waiting.updated', { entry: dto });
    return dto;
  }

  async get(restaurantId: string, id: string): Promise<WaitingRow> {
    const [row] = await this.db
      .select()
      .from(waitingEntries)
      .where(and(eq(waitingEntries.id, id), eq(waitingEntries.restaurantId, restaurantId)));
    if (!row) throw new NotFoundException('Waiting entry not found');
    return row;
  }

  async update(restaurantId: string, id: string, patch: { status?: WaitingStatus; notified?: boolean }): Promise<WaitingEntryDto> {
    await this.get(restaurantId, id);
    const [row] = await this.db
      .update(waitingEntries)
      .set({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.notified !== undefined ? { notifiedAt: patch.notified ? new Date() : null } : {}),
      })
      .where(eq(waitingEntries.id, id))
      .returning();
    const dto = toWaitingDto(row);
    this.realtime.emit(restaurantId, 'waiting.updated', { entry: dto });
    return dto;
  }

  /**
   * When tables free up, finds the longest-waiting party that fits them (alone or
   * together) for the default duration from now, and pushes a suggestion to tablets.
   */
  async suggestForFreedTables(restaurantId: string, tableIds: string[]) {
    if (!tableIds.length) return null;
    const waiting = await this.list(restaurantId);
    if (!waiting.length) return null;
    const restaurant = await this.restaurants.get(restaurantId);
    const now = new Date();
    const window = { from: now, to: new Date(now.getTime() + restaurant.defaultDurationMin * 60_000) };
    const busy = await this.availability.busyTableIds(restaurantId, window);
    const freed = (await this.db.select().from(tables).where(and(eq(tables.restaurantId, restaurantId), inArray(tables.id, tableIds), eq(tables.active, true)))).filter(
      (t) => !busy.has(t.id),
    );
    if (!freed.length) return null;

    for (const entry of waiting) {
      const single = freed
        .filter((t) => t.minSeats <= entry.covers && entry.covers <= t.maxSeats)
        .sort((a, b) => a.maxSeats - b.maxSeats)[0];
      const combined = freed.length > 1 && freed.reduce((n, t) => n + t.maxSeats, 0) >= entry.covers ? freed : null;
      const pick = single ? [single] : combined;
      if (pick) {
        const suggestion = { entry, tableIds: pick.map((t) => t.id), labels: pick.map((t) => t.label) };
        this.realtime.emit(restaurantId, 'waiting.suggest', suggestion);
        this.push.tableFree(restaurantId, entry, suggestion.labels);
        return suggestion;
      }
    }
    return null;
  }
}
