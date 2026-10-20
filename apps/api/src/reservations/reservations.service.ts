import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';
import {
  ACTIVE_STATUSES,
  canTransition,
  type MessageTemplate,
  type MoveReservationInput,
  type ReservationDto,
  type ReservationParsed,
  type ReservationStatus,
  type ValidationIssue,
} from '@hostly/shared';
import type { AuthUser } from '../common/decorators';
import { AuditService } from '../common/audit.service';
import { isExclusionViolation } from '../common/pg-errors';
import { businessDayWindow, parseDateTime } from '../common/time';
import type { DbOrTx } from '../db/client';
import { InjectDb, type Db } from '../db/db.module';
import { customers, reservations, reservationTables, tables, type ReservationRow, type RestaurantRow } from '../db/schema';
import { linkCustomer } from '../customers/customer-link';
import { MessagingService } from '../messaging/messaging.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { AvailabilityService } from './availability.service';
import { WaitingService } from '../waiting/waiting.service';

export const newGuestToken = () => randomBytes(24).toString('base64url');
const rangeLiteral = (from: Date, to: Date) => `[${from.toISOString()},${to.toISOString()})`;
const isActive = (s: ReservationStatus) => ACTIVE_STATUSES.includes(s);

/** Who is acting: a staff user, or the public widget / guest link. */
export type Actor = AuthUser | { id: null; restaurantId: string };

export interface CreateOptions {
  /** Validate opening hours etc. but never block (public widget does its own checks). */
  skipSoftChecks?: boolean;
  sendRequestReceived?: boolean;
}

@Injectable()
export class ReservationsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly restaurants: RestaurantService,
    private readonly availability: AvailabilityService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly messaging: MessagingService,
    private readonly waiting: WaitingService,
  ) {}

  // ---------- reads ----------

  async toDtos(rows: ReservationRow[], tx: DbOrTx = this.db): Promise<ReservationDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const customerIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is string => !!x))];
    const [links, custs] = await Promise.all([
      tx
        .select({ reservationId: reservationTables.reservationId, tableId: reservationTables.tableId, label: tables.label })
        .from(reservationTables)
        .innerJoin(tables, eq(tables.id, reservationTables.tableId))
        .where(inArray(reservationTables.reservationId, ids)),
      customerIds.length
        ? tx.select({ id: customers.id, type: customers.type }).from(customers).where(inArray(customers.id, customerIds))
        : Promise.resolve([]),
    ]);
    const tablesBy = new Map<string, Array<{ id: string; label: string }>>();
    for (const l of links) {
      const list = tablesBy.get(l.reservationId) ?? [];
      list.push({ id: l.tableId, label: l.label });
      tablesBy.set(l.reservationId, list);
    }
    const typeBy = new Map(custs.map((c) => [c.id, c.type]));
    return rows.map((r) => {
      const ts = (tablesBy.get(r.id) ?? []).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      return {
        id: r.id,
        customerId: r.customerId,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        email: r.email,
        covers: r.covers,
        arrivalAt: r.arrivalAt.toISOString(),
        departureAt: r.departureAt.toISOString(),
        purpose: r.purpose,
        status: r.status,
        source: r.source,
        notes: r.notes,
        dietary: r.dietary,
        tags: r.tags,
        fixMenu: r.fixMenu,
        language: r.language,
        areaId: r.areaId,
        tableIds: ts.map((t) => t.id),
        extras: r.extras,
        spend: r.spend,
        declineReason: r.declineReason,
        seatedAt: r.seatedAt?.toISOString() ?? null,
        completedAt: r.completedAt?.toISOString() ?? null,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        customerType: r.customerId ? (typeBy.get(r.customerId) ?? null) : null,
      };
    });
  }

  async toDto(row: ReservationRow, tx: DbOrTx = this.db): Promise<ReservationDto> {
    return (await this.toDtos([row], tx))[0];
  }

  async listForDay(restaurantId: string, date: string, statuses?: ReservationStatus[]): Promise<ReservationDto[]> {
    const restaurant = await this.restaurants.get(restaurantId);
    const { start, end } = businessDayWindow(restaurant, date);
    const rows = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurantId),
          gte(reservations.arrivalAt, start.toJSDate()),
          lt(reservations.arrivalAt, end.toJSDate()),
          statuses?.length ? inArray(reservations.status, statuses) : undefined,
        ),
      )
      .orderBy(asc(reservations.arrivalAt));
    return this.toDtos(rows);
  }

  /** Online requests waiting for a decision (upcoming only). */
  async priority(restaurantId: string): Promise<ReservationDto[]> {
    const rows = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurantId),
          eq(reservations.status, 'pending'),
          gte(reservations.departureAt, new Date()),
        ),
      )
      .orderBy(asc(reservations.arrivalAt));
    return this.toDtos(rows);
  }

  async getRow(restaurantId: string, id: string, tx: DbOrTx = this.db): Promise<ReservationRow> {
    const [row] = await tx
      .select()
      .from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.restaurantId, restaurantId)));
    if (!row) throw new NotFoundException('Reservation not found');
    return row;
  }

  async get(restaurantId: string, id: string): Promise<ReservationDto> {
    return this.toDto(await this.getRow(restaurantId, id));
  }

  // ---------- writes ----------

  private resolveWindow(restaurant: RestaurantRow, arrivalAt: string, departureAt?: string | null, fallbackMinutes?: number) {
    let arrival: DateTime;
    let departure: DateTime;
    try {
      arrival = parseDateTime(arrivalAt, restaurant.timezone);
      departure = departureAt
        ? parseDateTime(departureAt, restaurant.timezone)
        : arrival.plus({ minutes: fallbackMinutes ?? restaurant.defaultDurationMin });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (departure <= arrival) throw new BadRequestException('Return time must be after arrival');
    return { arrival, departure };
  }

  private async assertTablesOwned(tx: DbOrTx, restaurantId: string, tableIds: string[]) {
    if (!tableIds.length) return;
    const rows = await tx
      .select({ id: tables.id })
      .from(tables)
      .where(and(eq(tables.restaurantId, restaurantId), inArray(tables.id, tableIds)));
    if (rows.length !== new Set(tableIds).size) throw new BadRequestException('Unknown table');
  }

  private throwIfBlocking(issues: ValidationIssue[], force: boolean) {
    const blocking = issues.filter((i) => i.hard || !force);
    if (blocking.length) {
      const hard = blocking.some((i) => i.hard);
      throw new ConflictException({
        code: hard ? 'table_conflict' : 'validation',
        message: blocking.map((i) => i.message).join('; '),
        issues: blocking,
      });
    }
  }

  /** Replaces a reservation's table rows, keeping `during`/`active` in sync for the exclusion constraint. */
  private async writeTables(tx: DbOrTx, row: ReservationRow, tableIds: string[]) {
    await tx.delete(reservationTables).where(eq(reservationTables.reservationId, row.id));
    if (!tableIds.length) return;
    await tx.insert(reservationTables).values(
      [...new Set(tableIds)].map((tableId) => ({
        reservationId: row.id,
        tableId,
        restaurantId: row.restaurantId,
        during: rangeLiteral(row.arrivalAt, row.departureAt),
        active: isActive(row.status),
      })),
    );
  }

  private async syncTableWindow(tx: DbOrTx, row: ReservationRow) {
    await tx
      .update(reservationTables)
      .set({ during: rangeLiteral(row.arrivalAt, row.departureAt), active: isActive(row.status) })
      .where(eq(reservationTables.reservationId, row.id));
  }

  /** Runs a write in a transaction, mapping exclusion-constraint races to a 409. */
  private async inTx<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(fn);
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw new ConflictException({
          code: 'table_conflict',
          message: 'Table is already booked for that time',
          issues: [{ code: 'table_conflict', message: 'Table is already booked for that time', hard: true }],
        });
      }
      throw err;
    }
  }

  async validateInput(restaurantId: string, input: ReservationParsed, excludeReservationId?: string): Promise<ValidationIssue[]> {
    const restaurant = await this.restaurants.get(restaurantId);
    const { arrival, departure } = this.resolveWindow(restaurant, input.arrivalAt, input.departureAt);
    return this.availability.validate(restaurant, {
      arrival,
      departure,
      covers: input.covers,
      tableIds: input.tableIds,
      excludeReservationId,
      checkPast: !excludeReservationId && input.status !== 'seated',
    });
  }

  async create(actor: Actor, input: ReservationParsed, opts: CreateOptions = {}): Promise<ReservationDto> {
    const restaurant = await this.restaurants.get(actor.restaurantId);
    const { arrival, departure } = this.resolveWindow(restaurant, input.arrivalAt, input.departureAt);
    const now = new Date();

    const dto = await this.inTx(async (tx) => {
      await this.assertTablesOwned(tx, restaurant.id, input.tableIds);
      const issues = await this.availability.validate(
        restaurant,
        { arrival, departure, covers: input.covers, tableIds: input.tableIds, checkPast: input.status !== 'seated' },
        tx,
      );
      this.throwIfBlocking(opts.skipSoftChecks ? issues.filter((i) => i.hard) : issues, input.force);

      const customer = await linkCustomer(tx, restaurant.id, input, input.customerId);
      const [row] = await tx
        .insert(reservations)
        .values({
          restaurantId: restaurant.id,
          customerId: customer?.id ?? null,
          firstName: input.firstName ?? customer?.firstName ?? null,
          lastName: input.lastName ?? customer?.lastName ?? null,
          phone: customer?.phone ?? input.phone ?? null,
          email: input.email ?? customer?.email ?? null,
          covers: input.covers,
          arrivalAt: arrival.toJSDate(),
          departureAt: departure.toJSDate(),
          purpose: input.purpose,
          status: input.status,
          source: input.source,
          notes: input.notes,
          dietary: input.dietary,
          tags: input.tags,
          fixMenu: input.fixMenu,
          language: input.language ?? customer?.language ?? restaurant.defaultLanguage,
          areaId: input.areaId ?? null,
          extras: input.extras,
          spend: input.spend ?? null,
          guestToken: newGuestToken(),
          seatedAt: input.status === 'seated' ? now : null,
          completedAt: input.status === 'completed' ? now : null,
          createdBy: actor.id,
        })
        .returning();
      await this.writeTables(tx, row, input.tableIds);
      const out = await this.toDto(row, tx);
      await this.audit.log(tx, { restaurantId: restaurant.id, userId: actor.id, entity: 'reservation', entityId: row.id, action: 'create', after: out });
      return out;
    });

    this.realtime.emit(restaurant.id, 'reservation.created', { reservation: dto });
    if (dto.tableIds.length) this.realtime.emit(restaurant.id, 'table.status', { tableIds: dto.tableIds });
    if (dto.status === 'pending' && dto.source === 'online') this.realtime.emit(restaurant.id, 'priority.new', { reservation: dto });
    if (opts.sendRequestReceived) void this.messaging.notifyReservation(dto.id, 'request_received');
    return dto;
  }

  async update(actor: Actor, id: string, patch: Partial<ReservationParsed> & { force?: boolean }): Promise<ReservationDto> {
    const restaurant = await this.restaurants.get(actor.restaurantId);
    let previousStatus: ReservationStatus | undefined;
    const { before, after } = await this.inTx(async (tx) => {
      const row = await this.getRow(restaurant.id, id, tx);
      const before = await this.toDto(row, tx);
      previousStatus = row.status;
      if (patch.status && !canTransition(row.status, patch.status)) {
        throw new BadRequestException(`Cannot change status from ${row.status} to ${patch.status}`);
      }

      const timeChanged = patch.arrivalAt !== undefined || patch.departureAt !== undefined;
      let arrival: DateTime<boolean> = DateTime.fromJSDate(row.arrivalAt);
      let departure: DateTime<boolean> = DateTime.fromJSDate(row.departureAt);
      if (timeChanged) {
        const keepDuration = patch.departureAt === undefined ? departure.diff(arrival, 'minutes').minutes : undefined;
        ({ arrival, departure } = this.resolveWindow(
          restaurant,
          patch.arrivalAt ?? row.arrivalAt.toISOString(),
          patch.departureAt ?? (keepDuration === undefined ? row.departureAt.toISOString() : null),
          keepDuration,
        ));
      }
      const tableIds = patch.tableIds ?? before.tableIds;
      const covers = patch.covers ?? row.covers;
      const status = patch.status ?? row.status;

      if (patch.tableIds) await this.assertTablesOwned(tx, restaurant.id, patch.tableIds);
      const tablesChanged = !!patch.tableIds && patch.tableIds.join() !== before.tableIds.join();
      if (timeChanged || tablesChanged || patch.covers !== undefined || (isActive(status) && !isActive(row.status))) {
        const issues = await this.availability.validate(
          restaurant,
          { arrival, departure, covers, tableIds: isActive(status) ? tableIds : [], excludeReservationId: id },
          tx,
        );
        // Only re-check pacing/hours when the time actually moved.
        const relevant = timeChanged ? issues : issues.filter((i) => i.code !== 'closed' && !i.code.startsWith('pacing') && i.code !== 'past');
        this.throwIfBlocking(relevant, patch.force ?? false);
      }

      let customerId = row.customerId;
      if (patch.phone !== undefined || patch.customerId !== undefined || patch.birthday !== undefined) {
        const customer = await linkCustomer(
          tx,
          restaurant.id,
          { ...before, ...patch, language: patch.language ?? row.language },
          patch.customerId === undefined ? row.customerId : patch.customerId,
        );
        customerId = customer?.id ?? null;
      }

      const now = new Date();
      const [updated] = await tx
        .update(reservations)
        .set({
          customerId,
          firstName: patch.firstName !== undefined ? patch.firstName : row.firstName,
          lastName: patch.lastName !== undefined ? patch.lastName : row.lastName,
          phone: patch.phone !== undefined ? patch.phone : row.phone,
          email: patch.email !== undefined ? patch.email : row.email,
          covers,
          arrivalAt: arrival.toJSDate(),
          departureAt: departure.toJSDate(),
          purpose: patch.purpose ?? row.purpose,
          status,
          source: patch.source ?? row.source,
          notes: patch.notes !== undefined ? patch.notes : row.notes,
          dietary: patch.dietary ?? row.dietary,
          tags: patch.tags ?? row.tags,
          fixMenu: patch.fixMenu ?? row.fixMenu,
          language: patch.language ?? row.language,
          areaId: patch.areaId !== undefined ? patch.areaId : row.areaId,
          extras: patch.extras ?? row.extras,
          spend: patch.spend !== undefined ? patch.spend : row.spend,
          seatedAt: status === 'seated' && !row.seatedAt ? now : row.seatedAt,
          completedAt: status === 'completed' ? (row.completedAt ?? now) : null,
          updatedAt: now,
        })
        .where(eq(reservations.id, id))
        .returning();
      if (patch.tableIds) await this.writeTables(tx, updated, tableIds);
      else await this.syncTableWindow(tx, updated);
      const after = await this.toDto(updated, tx);
      await this.audit.log(tx, { restaurantId: restaurant.id, userId: actor.id, entity: 'reservation', entityId: id, action: 'update', before, after });
      return { before, after };
    });

    this.afterChange(restaurant.id, before, after, previousStatus!);
    return after;
  }

  /** Status transitions from the floor plan (seat, complete, no-show, cancel...). */
  async changeStatus(actor: Actor, id: string, status: ReservationStatus, reason?: string): Promise<ReservationDto> {
    const restaurant = await this.restaurants.get(actor.restaurantId);
    let previousStatus: ReservationStatus | undefined;
    const { before, after } = await this.inTx(async (tx) => {
      const row = await this.getRow(restaurant.id, id, tx);
      previousStatus = row.status;
      if (!canTransition(row.status, status)) throw new BadRequestException(`Cannot change status from ${row.status} to ${status}`);
      const before = await this.toDto(row, tx);
      const now = new Date();
      const patch: Partial<ReservationRow> = { status, updatedAt: now };
      if (status === 'seated') {
        patch.seatedAt = row.seatedAt ?? now;
        patch.completedAt = null;
        // Seating early moves the window so the table is held from now on.
        if (now < row.arrivalAt) {
          const duration = row.departureAt.getTime() - row.arrivalAt.getTime();
          patch.arrivalAt = now;
          patch.departureAt = new Date(now.getTime() + duration);
        }
      }
      if (status === 'completed') patch.completedAt = now;
      if (status === 'confirmed') patch.seatedAt = null;
      if (status === 'cancelled' && reason) patch.declineReason = reason;
      const [updated] = await tx.update(reservations).set(patch).where(eq(reservations.id, id)).returning();
      await this.syncTableWindow(tx, updated);
      const after = await this.toDto(updated, tx);
      await this.audit.log(tx, { restaurantId: restaurant.id, userId: actor.id, entity: 'reservation', entityId: id, action: `status:${status}`, before, after });
      return { before, after };
    });
    this.afterChange(restaurant.id, before, after, previousStatus!);
    return after;
  }

  /** Assign or move tables (and optionally the time window) — used by drag and drop. */
  async move(actor: Actor, id: string, input: MoveReservationInput): Promise<ReservationDto> {
    return this.update(actor, id, {
      tableIds: input.tableIds,
      ...(input.arrivalAt ? { arrivalAt: input.arrivalAt } : {}),
      ...(input.departureAt ? { departureAt: input.departureAt } : {}),
      force: true,
    });
  }

  async accept(actor: Actor, id: string, tableIds: string[]): Promise<ReservationDto> {
    const row = await this.getRow(actor.restaurantId, id);
    if (row.status !== 'pending') throw new BadRequestException('Only pending requests can be accepted');
    return this.update(actor, id, { status: 'confirmed', tableIds, force: true });
  }

  async decline(actor: Actor, id: string, reason?: string): Promise<ReservationDto> {
    const row = await this.getRow(actor.restaurantId, id);
    if (row.status !== 'pending') throw new BadRequestException('Only pending requests can be declined');
    const dto = await this.changeStatus(actor, id, 'cancelled', reason ?? undefined);
    return dto;
  }

  async remove(actor: Actor, id: string) {
    const restaurantId = actor.restaurantId;
    const before = await this.get(restaurantId, id);
    await this.db.transaction(async (tx) => {
      await tx.delete(reservations).where(and(eq(reservations.id, id), eq(reservations.restaurantId, restaurantId)));
      await this.audit.log(tx, { restaurantId, userId: actor.id, entity: 'reservation', entityId: id, action: 'delete', before });
    });
    this.realtime.emit(restaurantId, 'reservation.deleted', { id });
    if (before.tableIds.length) this.realtime.emit(restaurantId, 'table.status', { tableIds: before.tableIds });
  }

  /** Realtime events, guest emails and waiting-list suggestions after any change. */
  private afterChange(restaurantId: string, before: ReservationDto, after: ReservationDto, from: ReservationStatus) {
    this.realtime.emit(restaurantId, 'reservation.updated', { reservation: after });
    const touched = [...new Set([...before.tableIds, ...after.tableIds])];
    if (touched.length) this.realtime.emit(restaurantId, 'table.status', { tableIds: touched });

    const to = after.status;
    if (from !== to) {
      let template: MessageTemplate | null = null;
      if (from === 'pending' && to === 'confirmed') template = 'confirmed';
      else if (from === 'pending' && to === 'cancelled') template = 'declined';
      else if (to === 'cancelled') template = 'cancelled';
      if (template) void this.messaging.notifyReservation(after.id, template);

      // A table freed up: offer it to the waiting list.
      if ((from === 'seated' && to === 'completed') || to === 'no_show' || (from === 'seated' && to === 'cancelled')) {
        void this.waiting.suggestForFreedTables(restaurantId, after.tableIds);
      }
    }
  }

  /** Guest self-service via the emailed token. */
  async findByToken(token: string) {
    const [row] = await this.db.select().from(reservations).where(eq(reservations.guestToken, token));
    if (!row) throw new NotFoundException('Reservation not found');
    return row;
  }

  async guestCancel(token: string) {
    const row = await this.findByToken(token);
    if (row.status === 'cancelled') return row;
    if (!['pending', 'confirmed'].includes(row.status)) throw new BadRequestException('This reservation can no longer be cancelled');
    await this.changeStatus({ id: null, restaurantId: row.restaurantId }, row.id, 'cancelled');
    return this.findByToken(token);
  }

  /** "Confirm" from the email just records the click; it does not accept pending requests. */
  async guestConfirm(token: string) {
    const row = await this.findByToken(token);
    await this.audit.log(this.db, { restaurantId: row.restaurantId, userId: null, entity: 'reservation', entityId: row.id, action: 'guest:confirm' });
    return row;
  }
}
