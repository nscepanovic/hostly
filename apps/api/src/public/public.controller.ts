import { BadRequestException, Body, ConflictException, Controller, Get, Header, HttpCode, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  availabilityQuerySchema,
  publicBookingSchema,
  type PublicBookingInput,
  type PublicReservationView,
  type PublicRestaurantInfo,
  type PublicSlot,
} from '@hostly/shared';
import { Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import type { ReservationRow, RestaurantRow } from '../db/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { PublicAvailabilityService } from './public-availability.service';

/** Writes from the public widget: PUBLIC_RATE_LIMIT_PER_MIN per IP. */
const WRITE_LIMIT = { default: { limit: () => env().PUBLIC_RATE_LIMIT_PER_MIN, ttl: 60_000 } };

@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly restaurants: RestaurantService,
    private readonly availability: PublicAvailabilityService,
    private readonly reservations: ReservationsService,
  ) {}

  @Get(':slug')
  async info(@Param('slug') slug: string): Promise<PublicRestaurantInfo> {
    const r = await this.restaurants.getBySlug(slug);
    const o = r.onlineSettings;
    return {
      slug: r.slug,
      name: r.name,
      timezone: r.timezone,
      defaultLanguage: r.defaultLanguage,
      maxPartySize: Math.min(o.maxPartySize, r.maxPartySize),
      daysAhead: o.daysAhead,
      blockedDates: o.blockedDates,
      instagramUrl: o.instagramUrl,
      websiteUrl: o.websiteUrl,
      intro: o.intro,
      enabled: o.enabled,
      branding: await this.restaurants.branding(r),
    };
  }

  /** Cover / logo. URLs carry ?v=<upload time>, so they can be cached forever. */
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get(':slug/images/:kind')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@Param('slug') slug: string, @Param('kind') kind: string): Promise<StreamableFile> {
    const img = await this.restaurants.getImage(slug, kind);
    return new StreamableFile(img.data, { type: img.contentType, length: img.data.length });
  }

  /** Only times that really have capacity are offered as available. */
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get(':slug/availability')
  async slots(@Param('slug') slug: string, @Query(new ZodPipe(availabilityQuerySchema)) q: z.infer<typeof availabilityQuerySchema>): Promise<PublicSlot[]> {
    const r = await this.restaurants.getBySlug(slug);
    return this.availability.slots(r, q.date, q.covers);
  }

  @Throttle(WRITE_LIMIT)
  @Post(':slug/book')
  @HttpCode(201)
  async book(@Param('slug') slug: string, @Body(new ZodPipe(publicBookingSchema)) body: PublicBookingInput) {
    // Honeypot filled: pretend success so bots learn nothing.
    if (body.website) return { status: 'pending' as const };
    const r = await this.restaurants.getBySlug(slug);
    const check = await this.availability.checkRequest(r, body.date, body.time, body.covers);
    if (!check.ok) throw new ConflictException({ code: check.reason, message: 'This time is no longer available' });

    const dto = await this.reservations.create(
      { id: null, restaurantId: r.id },
      {
        status: 'pending',
        purpose: 'food',
        arrivalAt: check.arrival!.toISO()!,
        // No end from the guest: estimated from the party-size duration (same rule the slot check used).
        departureAt: null,
        covers: body.covers,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        email: body.email,
        customerId: null,
        areaId: null,
        // Hold the best table while the request waits for the host.
        tableIds: check.suggestion!.tableIds,
        source: 'online',
        notes: body.notes ?? null,
        tags: [],
        dietary: [],
        fixMenu: false,
        language: body.language ?? r.defaultLanguage,
        birthday: null,
        extras: {},
        spend: null,
        force: true,
      },
      { skipSoftChecks: true, sendRequestReceived: true },
    );
    return { status: dto.status };
  }

  private async view(row: ReservationRow, r: RestaurantRow): Promise<PublicReservationView> {
    return {
      restaurantName: r.name,
      status: row.status,
      arrivalAt: row.arrivalAt.toISOString(),
      covers: row.covers,
      firstName: row.firstName,
      language: row.language,
      timezone: r.timezone,
      branding: await this.restaurants.branding(r),
    };
  }

  @Get('r/:token')
  async guestView(@Param('token') token: string): Promise<PublicReservationView> {
    const row = await this.reservations.findByToken(token);
    const r = await this.restaurants.get(row.restaurantId);
    return this.view(row, r);
  }

  @Throttle(WRITE_LIMIT)
  @Post('r/:token/cancel')
  @HttpCode(200)
  async guestCancel(@Param('token') token: string): Promise<PublicReservationView> {
    const row = await this.reservations.guestCancel(token);
    const r = await this.restaurants.get(row.restaurantId);
    return this.view(row, r);
  }

  @Throttle(WRITE_LIMIT)
  @Post('r/:token/confirm')
  @HttpCode(200)
  async guestConfirm(@Param('token') token: string): Promise<PublicReservationView> {
    const row = await this.reservations.guestConfirm(token);
    if (row.status === 'cancelled') throw new BadRequestException('Reservation is cancelled');
    const r = await this.restaurants.get(row.restaurantId);
    return this.view(row, r);
  }
}
