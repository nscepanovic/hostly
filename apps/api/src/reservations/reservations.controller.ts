import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  declineSchema,
  moveReservationSchema,
  RESERVATION_STATUSES,
  reservationPatchSchema,
  reservationSchema,
  statusChangeSchema,
  suggestQuerySchema,
  type AuditLogDto,
  type MessageDto,
  type MoveReservationInput,
  type ReservationDto,
  type ReservationParsed,
  type SlotPace,
  type StatusChangeInput,
  type SuggestQuery,
  type TableSuggestion,
  type ValidationIssue,
} from '@hostly/shared';
import { eq } from 'drizzle-orm';
import { AuditService } from '../common/audit.service';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { parseDateTime } from '../common/time';
import { ZodPipe } from '../common/zod.pipe';
import { InjectDb, type Db } from '../db/db.module';
import { customers } from '../db/schema';
import { MessagingService } from '../messaging/messaging.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { AvailabilityService } from './availability.service';
import { ReservationsService } from './reservations.service';

const listQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(z.enum(RESERVATION_STATUSES)).optional()),
});
const dateQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const freeTablesQuery = z.object({
  arrivalAt: z.string().min(16),
  departureAt: z.string().min(16),
  excludeReservationId: z.uuid().optional(),
});
const acceptSchema = z.object({ tableIds: z.array(z.uuid()).default([]) });

@Controller('reservations')
export class ReservationsController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly reservations: ReservationsService,
    private readonly availability: AvailabilityService,
    private readonly restaurants: RestaurantService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>): Promise<ReservationDto[]> {
    return this.reservations.listForDay(user.restaurantId, q.date, q.status);
  }

  @Get('priority')
  priority(@CurrentUser() user: AuthUser): Promise<ReservationDto[]> {
    return this.reservations.priority(user.restaurantId);
  }

  @Get('pace')
  async pace(@CurrentUser() user: AuthUser, @Query(new ZodPipe(dateQuery)) q: { date: string }): Promise<SlotPace[]> {
    return this.availability.pace(await this.restaurants.get(user.restaurantId), q.date);
  }

  /** Best free tables for a party (auto table suggestion). */
  @Get('suggest')
  async suggest(@CurrentUser() user: AuthUser, @Query(new ZodPipe(suggestQuerySchema)) q: SuggestQuery): Promise<TableSuggestion[]> {
    const restaurant = await this.restaurants.get(user.restaurantId);
    let from;
    let to;
    try {
      from = parseDateTime(q.arrivalAt, restaurant.timezone);
      to = q.departureAt ? parseDateTime(q.departureAt, restaurant.timezone) : from.plus({ minutes: restaurant.defaultDurationMin });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    let customerType = null;
    if (q.customerId) {
      const [c] = await this.db.select({ type: customers.type }).from(customers).where(eq(customers.id, q.customerId));
      customerType = c?.type ?? null;
    }
    return this.availability.suggest(user.restaurantId, { from: from.toJSDate(), to: to.toJSDate() }, q.covers, {
      customerType,
      areaId: q.areaId,
      excludeReservationId: q.excludeReservationId,
    });
  }

  /** Ids of active tables free for a window, any size (manual table picker). */
  @Get('free-tables')
  async freeTables(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(freeTablesQuery)) q: z.infer<typeof freeTablesQuery>,
  ): Promise<string[]> {
    const restaurant = await this.restaurants.get(user.restaurantId);
    let from;
    let to;
    try {
      from = parseDateTime(q.arrivalAt, restaurant.timezone);
      to = parseDateTime(q.departureAt, restaurant.timezone);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const { free } = await this.availability.getFreeTables(user.restaurantId, { from: from.toJSDate(), to: to.toJSDate() }, 1, {
      excludeReservationId: q.excludeReservationId,
    });
    return free.map((t) => t.id);
  }

  /** Dry-run validation so the form can warn before saving. */
  @Post('validate')
  @HttpCode(200)
  validate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(reservationSchema.extend({ id: z.uuid().optional() }))) body: ReservationParsed & { id?: string },
  ): Promise<ValidationIssue[]> {
    return this.reservations.validateInput(user.restaurantId, body, body.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ReservationDto> {
    return this.reservations.get(user.restaurantId, id);
  }

  @Get(':id/messages')
  async messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MessageDto[]> {
    await this.reservations.getRow(user.restaurantId, id);
    return this.messaging.listForReservation(id);
  }

  @Get(':id/audit')
  async history(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<AuditLogDto[]> {
    return this.audit.forEntity(user.restaurantId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(reservationSchema)) body: ReservationParsed): Promise<ReservationDto> {
    return this.reservations.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() raw: Record<string, unknown>,
  ): Promise<ReservationDto> {
    const parsed = new ZodPipe(reservationPatchSchema).transform(raw ?? {}) as Partial<ReservationParsed> & { force?: boolean };
    return this.reservations.update(user, id, onlySentKeys(parsed, raw ?? {}));
  }

  @Post(':id/status')
  @HttpCode(200)
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(statusChangeSchema)) body: StatusChangeInput,
  ): Promise<ReservationDto> {
    return this.reservations.changeStatus(user, id, body.status, body.reason);
  }

  @Post(':id/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(moveReservationSchema)) body: MoveReservationInput,
  ): Promise<ReservationDto> {
    return this.reservations.move(user, id, body);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(acceptSchema)) body: { tableIds: string[] },
  ): Promise<ReservationDto> {
    return this.reservations.accept(user, id, body.tableIds);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(declineSchema)) body: { reason?: string },
  ): Promise<ReservationDto> {
    return this.reservations.decline(user, id, body.reason);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservations.remove(user, id);
  }
}

/**
 * The patch schema reuses field schemas with defaults and null-transforms, so zod
 * fills values for keys the client never sent. Keep only the keys actually sent.
 */
export function onlySentKeys<T extends Record<string, unknown>>(parsed: T, raw: Record<string, unknown>): T {
  const out: Record<string, unknown> = { force: parsed.force ?? false };
  for (const key of Object.keys(raw)) if (key in parsed) out[key] = parsed[key];
  return out as T;
}
