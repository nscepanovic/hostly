import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  AdminActivityDto,
  AdminMessageDto,
  AdminOverviewDto,
  AdminRestaurantDetail,
  AdminRestaurantRow,
  DailyPoint,
  Role,
} from '@hostly/shared';
import { emailIndex } from '../common/crypto';
import { rethrowConflict } from '../common/pg-errors';
import { InjectDb, type Db } from '../db/db.module';
import { auditLog, messages, restaurants, users, type RestaurantRow } from '../db/schema';
import { createRestaurant, shareGuests, SLUG_RE, unshareGuests } from '../db/tenant';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { AdminUser } from './admin-auth.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };
const startedAt = new Date();

/** j***@example.com: operators monitor delivery, they don't need the guest's address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

const n = (v: unknown) => Number(v ?? 0);

/** Read-mostly platform monitoring. Never returns guest personal data, only counts and staff names. */
@Injectable()
export class AdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly gateway: RealtimeGateway,
  ) {}

  /** Reservations created per UTC day for the last 30 days (zero-filled). */
  private async perDay(restaurantId?: string): Promise<DailyPoint[]> {
    const filter = restaurantId ? sql`and r.restaurant_id = ${restaurantId}` : sql``;
    const { rows } = await this.db.execute<{ date: string; reservations: number; online: number; covers: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as date,
             count(r.id)::int as reservations,
             count(r.id) filter (where r.source = 'online')::int as online,
             coalesce(sum(r.covers), 0)::int as covers
      from generate_series((now() at time zone 'utc')::date - 29, (now() at time zone 'utc')::date, interval '1 day') d
      left join reservations r on (r.created_at at time zone 'utc')::date = d::date ${filter}
      group by d order by d`);
    return rows.map((r) => ({ date: r.date, reservations: n(r.reservations), online: n(r.online), covers: n(r.covers) }));
  }

  async overview(): Promise<AdminOverviewDto> {
    const t0 = Date.now();
    const { rows: ping } = await this.db.execute(sql`select 1 as ok`);
    const dbLatencyMs = Date.now() - t0;

    const { rows: [counts] } = await this.db.execute<Record<string, number>>(sql`
      select
        (select count(*) from restaurants)::int as restaurants,
        (select count(*) from restaurants where suspended_at is not null)::int as suspended,
        (select count(distinct restaurant_id) from reservations where created_at > now() - interval '7 days')::int as active7d,
        (select count(*) from users)::int as staff,
        (select count(*) from customers)::int as guests,
        (select count(*) from reservations where created_at > now() - interval '24 hours')::int as r24h,
        (select count(*) from reservations where created_at > now() - interval '7 days')::int as r7d,
        (select count(*) from reservations where created_at > now() - interval '30 days')::int as r30d,
        (select coalesce(sum(covers), 0) from reservations where created_at > now() - interval '30 days')::int as covers30d,
        (select count(*) from reservations where created_at > now() - interval '30 days' and source = 'online')::int as online30d,
        (select count(*) from reservations where arrival_at between now() - interval '30 days' and now() and status = 'no_show')::int as noshow30d,
        (select count(*) from reservations where arrival_at between now() - interval '30 days' and now() and status in ('completed','seated','no_show'))::int as arrived30d,
        (select count(*) from reservations where status = 'pending' and departure_at > now())::int as pending,
        (select count(*) from messages where created_at > now() - interval '24 hours' and status = 'sent')::int as sent24h,
        (select count(*) from messages where created_at > now() - interval '24 hours' and status = 'failed')::int as failed24h`);

    const devices = [...this.gateway.connectedByRestaurant().values()].reduce((a, b) => a + b, 0);
    return {
      restaurants: { total: n(counts.restaurants), suspended: n(counts.suspended), activeLast7d: n(counts.active7d) },
      staffUsers: n(counts.staff),
      guests: n(counts.guests),
      reservations: {
        last24h: n(counts.r24h),
        last7d: n(counts.r7d),
        last30d: n(counts.r30d),
        covers30d: n(counts.covers30d),
        onlineShare30d: n(counts.r30d) ? n(counts.online30d) / n(counts.r30d) : 0,
        noShowRate30d: n(counts.arrived30d) ? n(counts.noshow30d) / n(counts.arrived30d) : 0,
      },
      pendingOnline: n(counts.pending),
      emails24h: { sent: n(counts.sent24h), failed: n(counts.failed24h) },
      connectedDevices: devices,
      system: {
        dbOk: ping.length === 1,
        dbLatencyMs,
        uptimeSec: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        node: process.version,
        version,
        startedAt: startedAt.toISOString(),
      },
      perDay: await this.perDay(),
    };
  }

  async restaurants(): Promise<AdminRestaurantRow[]> {
    const { rows } = await this.db.execute<Record<string, unknown>>(sql`
      select r.id, r.name, r.slug, r.created_at, r.suspended_at, r.guest_book_id,
             (r.online_settings->>'enabled')::boolean as online_enabled,
             (select count(*) from users u where u.restaurant_id = r.id)::int as staff,
             (select count(*) from tables t where t.restaurant_id = r.id and t.active)::int as tables,
             (select count(*) from customers c where c.guest_book_id = r.guest_book_id)::int as guests,
             (select count(*) from reservations x where x.restaurant_id = r.id and x.created_at > now() - interval '30 days')::int as res30d,
             (select coalesce(sum(covers), 0) from reservations x where x.restaurant_id = r.id and x.created_at > now() - interval '30 days')::int as covers30d,
             greatest(
               (select max(created_at) from reservations x where x.restaurant_id = r.id),
               (select max(at) from audit_log a where a.restaurant_id = r.id)
             ) as last_activity
      from restaurants r order by r.name`);
    const devices = this.gateway.connectedByRestaurant();
    const byBook = new Map<string, Array<{ id: string; name: string }>>();
    for (const r of rows) byBook.set(String(r.guest_book_id), [...(byBook.get(String(r.guest_book_id)) ?? []), { id: String(r.id), name: String(r.name) }]);
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      createdAt: iso(r.created_at)!,
      suspendedAt: iso(r.suspended_at),
      onlineEnabled: !!r.online_enabled,
      staff: n(r.staff),
      tables: n(r.tables),
      guests: n(r.guests),
      reservations30d: n(r.res30d),
      covers30d: n(r.covers30d),
      lastActivityAt: iso(r.last_activity),
      connectedDevices: devices.get(String(r.id)) ?? 0,
      sharesGuestsWith: (byBook.get(String(r.guest_book_id)) ?? []).filter((x) => x.id !== r.id),
    }));
  }

  private async row(id: string): Promise<RestaurantRow> {
    const [r] = await this.db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!r) throw new NotFoundException('Restaurant not found');
    return r;
  }

  async restaurant(id: string): Promise<AdminRestaurantDetail> {
    const r = await this.row(id);
    const summary = (await this.restaurants()).find((x) => x.id === id)!;
    const staff = await this.db.select().from(users).where(eq(users.restaurantId, id));
    return {
      ...summary,
      timezone: r.timezone,
      email: r.email,
      phone: r.phone,
      users: staff
        .map((u) => ({ id: u.id, restaurantId: u.restaurantId, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt.toISOString() }))
        .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1)),
      perDay: await this.perDay(id),
      activity: await this.activity({ restaurantId: id, limit: 50 }),
      failedMessages: await this.messages({ restaurantId: id, status: 'failed', limit: 20 }),
    };
  }

  /** Staff actions across restaurants. Only who/what/when: before/after snapshots (guest data) are not exposed. */
  async activity(opts: { restaurantId?: string; limit?: number } = {}): Promise<AdminActivityDto[]> {
    const rows = await this.db
      .select({ id: auditLog.id, at: auditLog.at, restaurantId: auditLog.restaurantId, restaurantName: restaurants.name, userName: users.name, entity: auditLog.entity, action: auditLog.action })
      .from(auditLog)
      .innerJoin(restaurants, eq(restaurants.id, auditLog.restaurantId))
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(opts.restaurantId ? eq(auditLog.restaurantId, opts.restaurantId) : undefined)
      .orderBy(desc(auditLog.at))
      .limit(Math.min(opts.limit ?? 100, 500));
    return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
  }

  async messages(opts: { restaurantId?: string; status?: 'sent' | 'failed' | 'queued'; limit?: number } = {}): Promise<AdminMessageDto[]> {
    const rows = await this.db
      .select({ m: messages, restaurantName: restaurants.name })
      .from(messages)
      .innerJoin(restaurants, eq(restaurants.id, messages.restaurantId))
      .where(
        and(
          opts.restaurantId ? eq(messages.restaurantId, opts.restaurantId) : undefined,
          opts.status ? eq(messages.status, opts.status) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(opts.limit ?? 100, 500));
    return rows.map(({ m, restaurantName }) => ({
      id: m.id,
      createdAt: m.createdAt.toISOString(),
      restaurantId: m.restaurantId,
      restaurantName,
      templateKey: m.templateKey,
      language: m.language,
      status: m.status,
      recipient: maskEmail(m.recipient),
      error: m.error,
    }));
  }

  // ---------- actions ----------

  private async log(restaurantId: string, admin: AdminUser, action: string, after?: unknown) {
    await this.db.insert(auditLog).values({ restaurantId, userId: null, entity: 'restaurant', entityId: restaurantId, action: `admin:${action}`, after: { admin: admin.name, ...(after as object) } });
  }

  async create(
    admin: AdminUser,
    input: { name: string; slug: string; ownerName: string; ownerEmail: string; ownerPassword: string; timezone?: string; language?: 'sr' | 'en'; shareGuestsWith?: string },
  ) {
    if (!SLUG_RE.test(input.slug)) throw new BadRequestException('Slug: lowercase letters, digits and dashes only');
    const shareWith = input.shareGuestsWith ? await this.row(input.shareGuestsWith) : undefined;
    try {
      const { restaurant } = await this.db.transaction((tx) =>
        createRestaurant(tx, {
          name: input.name,
          slug: input.slug,
          timezone: input.timezone,
          defaultLanguage: input.language,
          owner: { name: input.ownerName, email: input.ownerEmail, password: input.ownerPassword },
          guestBookId: shareWith?.guestBookId,
        }),
      );
      await this.log(restaurant.id, admin, 'create');
      return this.restaurant(restaurant.id);
    } catch (err) {
      rethrowConflict(err, { unique: 'That slug or owner email is already taken' });
    }
  }

  async setSuspended(admin: AdminUser, id: string, suspended: boolean) {
    await this.row(id);
    await this.db.update(restaurants).set({ suspendedAt: suspended ? new Date() : null }).where(eq(restaurants.id, id));
    if (suspended) this.gateway.disconnectRestaurant(id);
    await this.log(id, admin, suspended ? 'suspend' : 'reactivate');
    return this.restaurant(id);
  }

  async share(admin: AdminUser, id: string, withId: string) {
    if (id === withId) throw new BadRequestException('Pick another restaurant');
    await Promise.all([this.row(id), this.row(withId)]);
    const result = await this.db.transaction((tx) => shareGuests(tx, id, withId));
    await this.log(id, admin, 'share-guests', { with: withId, merged: result.merged, moved: result.moved });
    return { ...result, restaurant: await this.restaurant(id) };
  }

  async unshare(admin: AdminUser, id: string) {
    await this.row(id);
    const result = await this.db.transaction((tx) => unshareGuests(tx, id));
    await this.log(id, admin, 'unshare-guests', { copied: result.copied });
    return { ...result, restaurant: await this.restaurant(id) };
  }

  async addUser(admin: AdminUser, restaurantId: string, input: { name: string; email: string; password: string; role: Role }) {
    await this.row(restaurantId);
    try {
      await this.db.insert(users).values({
        restaurantId,
        name: input.name,
        email: input.email.toLowerCase(),
        emailIndex: emailIndex(input.email)!,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 10),
      });
    } catch (err) {
      rethrowConflict(err, { unique: 'A user with this email already exists' });
    }
    await this.log(restaurantId, admin, 'add-user', { role: input.role });
    return this.restaurant(restaurantId);
  }

  async resetPassword(admin: AdminUser, userId: string, password: string) {
    const [u] = await this.db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10) })
      .where(eq(users.id, userId))
      .returning({ restaurantId: users.restaurantId });
    if (!u) throw new NotFoundException('User not found');
    await this.log(u.restaurantId, admin, 'reset-password');
  }
}
