import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import {
  BRANDING_IMAGES,
  DEFAULT_BOOKING_THEME,
  type BrandingImage,
  type OnlineSettings,
  type PublicBranding,
  type RestaurantDto,
  type RestaurantSettingsInput,
} from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { restaurantImages, restaurants, type RestaurantRow } from '../db/schema';

/** Uploads are resized in the browser first; this only stops abuse. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Content type from the file's first bytes (never trust the client's label). SVG is not accepted. */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

type ImageUrls = RestaurantDto['images'];
const NO_IMAGES: ImageUrls = { cover: null, logo: null };

export const toRestaurantDto = (r: RestaurantRow, sharesGuestsWith: RestaurantDto['sharesGuestsWith'] = [], images: ImageUrls = NO_IMAGES): RestaurantDto => ({
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
  images,
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
    return toRestaurantDto(row, peers, await this.imageUrls(row));
  }

  /** Versioned URLs, so browsers can cache an image forever and still see a new upload. */
  async imageUrls(r: Pick<RestaurantRow, 'id' | 'slug'>): Promise<ImageUrls> {
    const rows = await this.db
      .select({ kind: restaurantImages.kind, updatedAt: restaurantImages.updatedAt })
      .from(restaurantImages)
      .where(eq(restaurantImages.restaurantId, r.id));
    const urls = { ...NO_IMAGES };
    for (const row of rows) urls[row.kind] = `/api/public/${r.slug}/images/${row.kind}?v=${row.updatedAt.getTime()}`;
    return urls;
  }

  async branding(r: RestaurantRow): Promise<PublicBranding> {
    return { theme: r.onlineSettings.theme ?? DEFAULT_BOOKING_THEME, images: await this.imageUrls(r) };
  }

  async putImage(restaurantId: string, kind: BrandingImage, data: Buffer): Promise<void> {
    if (!BRANDING_IMAGES.includes(kind)) throw new NotFoundException();
    if (data.length > MAX_IMAGE_BYTES) throw new BadRequestException('Image is too large');
    const contentType = sniffImageType(data);
    if (!contentType) throw new BadRequestException('Use a JPEG, PNG or WebP image');
    await this.db
      .insert(restaurantImages)
      .values({ restaurantId, kind, contentType, data })
      .onConflictDoUpdate({ target: [restaurantImages.restaurantId, restaurantImages.kind], set: { contentType, data, updatedAt: new Date() } });
  }

  async deleteImage(restaurantId: string, kind: BrandingImage): Promise<void> {
    await this.db.delete(restaurantImages).where(and(eq(restaurantImages.restaurantId, restaurantId), eq(restaurantImages.kind, kind)));
  }

  async getImage(slug: string, kind: string): Promise<{ contentType: string; data: Buffer }> {
    const r = await this.getBySlug(slug);
    const [row] = await this.db
      .select({ contentType: restaurantImages.contentType, data: restaurantImages.data })
      .from(restaurantImages)
      .where(and(eq(restaurantImages.restaurantId, r.id), eq(restaurantImages.kind, kind as BrandingImage)));
    if (!row) throw new NotFoundException('Image not found');
    return row;
  }

  /** Public lookup (booking page): suspended restaurants are not found. */
  async getBySlug(slug: string): Promise<RestaurantRow> {
    const [row] = await this.db.select().from(restaurants).where(eq(restaurants.slug, slug));
    if (!row || row.suspendedAt) throw new NotFoundException('Restaurant not found');
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
