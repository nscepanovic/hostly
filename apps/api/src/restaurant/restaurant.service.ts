import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import type { OnlineSettings, RestaurantDto, RestaurantSettingsInput } from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { restaurants, type RestaurantRow } from '../db/schema';

export const toRestaurantDto = (r: RestaurantRow, sharesGuestsWith: RestaurantDto['sharesGuestsWith'] = []): RestaurantDto => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  timezone: r.timezone,
  defaultLanguage: r.defaultLanguage,
  openingHours: r.openingHours,
  dayStart: r.dayStart,
  defaultDurationMin: r.defaultDurationMin,
  slotMinutes: r.slotMinutes,
  maxPartySize: r.maxPartySize,
  pacingMaxReservationsPerSlot: r.pacingMaxReservationsPerSlot,
  pacingMaxCoversPerSlot: r.pacingMaxCoversPerSlot,
  onlineSettings: r.onlineSettings,
  email: r.email,
  phone: r.phone,
  address: r.address,
  sharesGuestsWith,
});

@Injectable()
export class RestaurantService {
  constructor(@InjectDb() private readonly db: Db) {}

  async get(id: string): Promise<RestaurantRow> {
    const [row] = await this.db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!row) throw new NotFoundException('Restaurant not found');
    return row;
  }

  /** The restaurant as the staff app sees it, including guest-book sharing. */
  async getDto(id: string): Promise<RestaurantDto> {
    const row = await this.get(id);
    const peers = await this.db
      .select({ name: restaurants.name, slug: restaurants.slug })
      .from(restaurants)
      .where(and(eq(restaurants.guestBookId, row.guestBookId), ne(restaurants.id, id)));
    return toRestaurantDto(row, peers);
  }

  async getBySlug(slug: string): Promise<RestaurantRow> {
    const [row] = await this.db.select().from(restaurants).where(eq(restaurants.slug, slug));
    if (!row) throw new NotFoundException('Restaurant not found');
    return row;
  }

  async updateSettings(id: string, input: RestaurantSettingsInput): Promise<RestaurantRow> {
    const [row] = await this.db.update(restaurants).set(input).where(eq(restaurants.id, id)).returning();
    return row;
  }

  async updateOnline(id: string, input: OnlineSettings): Promise<RestaurantRow> {
    const [row] = await this.db.update(restaurants).set({ onlineSettings: input }).where(eq(restaurants.id, id)).returning();
    return row;
  }
}
