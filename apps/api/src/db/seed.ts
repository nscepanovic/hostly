/* eslint-disable no-console */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import {
  DEFAULT_ONLINE_SETTINGS,
  normalizePhone,
  type CustomerType,
  type OpeningHours,
  type ReservationSource,
  type ReservationStatus,
} from '@hostly/shared';
import { env } from '../config/env';
import { createDb, type Db } from './client';
import * as s from './schema';
import { createRestaurant } from './tenant';

export const guestToken = () => randomBytes(24).toString('base64url');
export const rangeLiteral = (from: Date, to: Date) => `[${from.toISOString()},${to.toISOString()})`;

const OPENING_HOURS: OpeningHours = Object.fromEntries(
  ['1', '2', '3', '4', '5', '6'].map((d) => [
    d,
    [
      { name: 'lunch', open: '09:00', close: '16:00' },
      { name: 'dinner', open: '16:00', close: '01:00' },
    ],
  ]),
);
OPENING_HOURS['7'] = [
  { name: 'lunch', open: '10:00', close: '16:00' },
  { name: 'dinner', open: '16:00', close: '23:00' },
];

/** Layout modelled on the competitor's "Restoran" floor (canvas ~1000x600). */
const TABLES: Array<[label: string, shape: 'rect' | 'round', x: number, y: number, w: number, h: number, min: number, max: number, rating: number]> = [
  ['br 1', 'rect', 40, 40, 80, 80, 1, 2, 6],
  ['br 2', 'rect', 220, 40, 90, 100, 2, 4, 7],
  ['br 3', 'rect', 400, 40, 90, 100, 2, 4, 7],
  ['br 4', 'rect', 600, 30, 80, 80, 1, 2, 8],
  ['br 5', 'rect', 800, 30, 110, 100, 4, 6, 9],
  ['br 6', 'rect', 60, 280, 80, 80, 1, 2, 4],
  ['br 7', 'rect', 600, 260, 80, 80, 1, 2, 5],
  ['br 8', 'rect', 280, 250, 180, 100, 6, 8, 6],
  ['br 9', 'rect', 180, 470, 80, 80, 1, 2, 3],
  ['br 10', 'round', 400, 450, 100, 100, 2, 4, 5],
  ['br 11', 'rect', 600, 470, 80, 80, 1, 2, 4],
  ['br 12', 'rect', 790, 450, 110, 100, 4, 6, 8],
];

const CUSTOMERS: Array<[first: string, last: string | null, phone: string, type: CustomerType, extra?: Partial<typeof s.customers.$inferInsert>]> = [
  ['Slađana', 'Petrović', '064 996 4772', 'regular'],
  ['Omar', 'Hadžić', '+387 61 664 847', 'regular', { language: 'en' }],
  ['Julia', 'Weber', '+382 67 443 907', 'regular', { language: 'en', email: 'julia.weber@example.com' }],
  ['Sanja', 'Jovanović', '063 773 5033', 'vip', { email: 'sanja.j@example.com', tags: ['wine lover'] }],
  ['Vladimir', 'Nikolić', '062 488 024', 'regular'],
  ['Marko', 'Ilić', '063 162 9548', 'regular'],
  ['Kalo', 'Stanić', '069 205 9888', 'regular'],
  ['Mihail', 'Popov', '069 570 5543', 'regular', { language: 'en' }],
  ['Ljiljana', 'Cvjetičanin', '069 251 2129', 'vip', { company: 'Tapirijens', tags: ['regular'] }],
  ['Jelena', 'Vranješ', '063 877 9297', 'svip', { company: '3 Lateral', notes: 'Prefers br 5' }],
  ['Kancelarija', '3 Lateral', '021 420 215', 'svip', { company: '3 Lateral' }],
  ['Nataša', 'Lazić', '063 523 316', 'svip', { company: '3 Lateral' }],
  ['Milan', 'Đorđević', '064 111 2233', 'regular', { birthday: '1985-10-21' }],
  ['Ana', 'Marković', '065 222 3344', 'regular', { email: 'ana.m@example.com' }],
  ['Nikola', 'Stojanović', '066 333 4455', 'vip'],
  ['Ivana', 'Kovačević', '060 444 5566', 'regular', { tags: ['vegan'] }],
  ['Petar', 'Pavlović', '061 555 6677', 'blacklisted', { notes: 'Two no-shows in a row' }],
  ['Tamara', 'Savić', '062 666 7788', 'regular'],
  ['Stefan', 'Milošević', '063 777 8899', 'regular'],
  ['Emma', 'Clarke', '+44 7700 900123', 'regular', { language: 'en', email: 'emma.clarke@example.com' }],
];

export async function seed(db: Db, opts: { slug?: string; name?: string; password?: string; today?: DateTime } = {}) {
  const slug = opts.slug ?? process.env.SEED_SLUG ?? 'restoran';
  const password = opts.password ?? process.env.SEED_PASSWORD ?? 'hostly123';
  const timezone = 'Europe/Belgrade';
  const hash = await bcrypt.hash(password, 10);

  return db.transaction(async (tx) => {
    const { restaurant, owner, area } = await createRestaurant(tx, {
      name: opts.name ?? process.env.SEED_NAME ?? 'Restoran',
      slug,
      timezone,
      defaultLanguage: 'sr',
      areaName: 'Restoran',
      openingHours: OPENING_HOURS,
      owner: { email: `owner@${slug}.local`, name: 'Owner', password },
      onlineSettings: { shiftCapacity: { lunch: 40, dinner: 60 }, instagramUrl: 'https://instagram.com/', websiteUrl: 'https://example.com' },
      extra: { pacingMaxReservationsPerSlot: 6, pacingMaxCoversPerSlot: 16, email: 'info@example.com', phone: '+381 21 000 000' },
    });
    const rid = restaurant.id;

    const hosts = await tx
      .insert(s.users)
      .values([
        { restaurantId: rid, email: `host1@${slug}.local`, name: 'Host 1', role: 'host' as const, passwordHash: hash },
        { restaurantId: rid, email: `host2@${slug}.local`, name: 'Host 2', role: 'host' as const, passwordHash: hash },
      ])
      .returning();
    const userRows = [owner, ...hosts];

    const tableRows = await tx
      .insert(s.tables)
      .values(
        TABLES.map(([label, shape, x, y, w, h, minSeats, maxSeats, rating]) => ({
          restaurantId: rid,
          areaId: area.id,
          label,
          shape,
          x,
          y,
          w,
          h,
          rotation: 0,
          minSeats,
          maxSeats,
          rating,
        })),
      )
      .returning();
    const t = Object.fromEntries(tableRows.map((r) => [r.label, r]));

    await tx.insert(s.tableJoinGroups).values([
      { restaurantId: rid, name: 'br 2 + br 3', tableIds: [t['br 2'].id, t['br 3'].id] },
      { restaurantId: rid, name: 'br 5 + br 12', tableIds: [t['br 5'].id, t['br 12'].id] },
      { restaurantId: rid, name: 'br 8 + br 10', tableIds: [t['br 8'].id, t['br 10'].id] },
    ]);

    const customerRows = await tx
      .insert(s.customers)
      .values(
        CUSTOMERS.map(([firstName, lastName, phone, type, extra]) => ({
          restaurantId: rid,
          guestBookId: restaurant.guestBookId,
          firstName,
          lastName,
          phone: normalizePhone(phone),
          type,
          tags: [],
          ...extra,
        })),
      )
      .returning();
    const c = (first: string) => customerRows.find((r) => r.firstName === first)!;

    // A day of reservations around "now" so every floor-plan state is visible.
    const now = (opts.today ?? DateTime.now()).setZone(timezone);
    const day = now.startOf('day');
    const at = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return day.set({ hour: h, minute: m });
    };
    const statusFor = (arrival: DateTime, departure: DateTime): ReservationStatus =>
      departure < now ? 'completed' : arrival <= now ? 'seated' : 'confirmed';

    type Sample = { cust?: string; name?: [string, string]; time: string; mins: number; covers: number; tables: string[]; source: ReservationSource; status?: ReservationStatus; notes?: string; tags?: string[]; dietary?: string[] };
    const samples: Sample[] = [
      { cust: 'Sanja', time: '09:30', mins: 90, covers: 2, tables: ['br 4'], source: 'phone', tags: ['window seat'] },
      { cust: 'Jelena', time: '12:00', mins: 120, covers: 5, tables: ['br 5'], source: 'phone', notes: 'Company lunch', tags: ['business'] },
      { cust: 'Ljiljana', time: '13:00', mins: 120, covers: 4, tables: ['br 2'], source: 'staff' },
      { cust: 'Milan', time: '14:00', mins: 120, covers: 2, tables: ['br 1'], source: 'phone', tags: ['birthday'], dietary: ['gluten free'] },
      { cust: 'Julia', time: '18:00', mins: 120, covers: 3, tables: ['br 3'], source: 'online' },
      { cust: 'Nikola', time: '19:00', mins: 150, covers: 8, tables: ['br 8'], source: 'phone', notes: 'Anniversary dinner', tags: ['anniversary'] },
      { cust: 'Ivana', time: '19:30', mins: 120, covers: 2, tables: [], source: 'phone', dietary: ['vegan'] },
      { cust: 'Emma', time: '20:00', mins: 120, covers: 4, tables: [], source: 'online', status: 'pending', notes: 'Is there a kids menu?' },
      { cust: 'Tamara', time: '20:30', mins: 120, covers: 2, tables: ['br 7'], source: 'phone', status: 'cancelled' },
      { name: ['Walk', 'In'], time: '10:15', mins: 60, covers: 2, tables: ['br 6'], source: 'walk_in' },
    ];

    for (const sm of samples) {
      const arrival = at(sm.time);
      const departure = arrival.plus({ minutes: sm.mins });
      const cust = sm.cust ? c(sm.cust) : undefined;
      const status = sm.status ?? statusFor(arrival, departure);
      const [res] = await tx
        .insert(s.reservations)
        .values({
          restaurantId: rid,
          customerId: cust?.id ?? null,
          firstName: cust?.firstName ?? sm.name?.[0] ?? null,
          lastName: cust?.lastName ?? sm.name?.[1] ?? null,
          phone: cust?.phone ?? null,
          email: cust?.email ?? null,
          covers: sm.covers,
          arrivalAt: arrival.toJSDate(),
          departureAt: departure.toJSDate(),
          purpose: 'food',
          status,
          source: sm.source,
          notes: sm.notes ?? null,
          tags: sm.tags ?? [],
          dietary: sm.dietary ?? [],
          language: cust?.language ?? 'sr',
          areaId: area.id,
          guestToken: guestToken(),
          seatedAt: status === 'seated' || status === 'completed' ? arrival.toJSDate() : null,
          completedAt: status === 'completed' ? departure.toJSDate() : null,
          createdBy: sm.source === 'online' ? null : userRows[1].id,
        })
        .returning();
      if (sm.tables.length) {
        await tx.insert(s.reservationTables).values(
          sm.tables.map((label) => ({
            reservationId: res.id,
            tableId: t[label].id,
            restaurantId: rid,
            during: rangeLiteral(arrival.toJSDate(), departure.toJSDate()),
            active: ['pending', 'confirmed', 'seated'].includes(status),
          })),
        );
      }
    }

    // Past visits so customer counters and history have data.
    const past: Array<[string, number, ReservationStatus, number | null]> = [
      ['Jelena', 7, 'completed', 18500],
      ['Jelena', 14, 'completed', 22300],
      ['Jelena', 30, 'completed', 9800],
      ['Ljiljana', 3, 'completed', 6400],
      ['Ljiljana', 10, 'completed', 5200],
      ['Sanja', 5, 'completed', 4300],
      ['Sanja', 20, 'cancelled', null],
      ['Petar', 12, 'no_show', null],
      ['Petar', 26, 'no_show', null],
      ['Omar', 8, 'cancelled', null],
      ['Slađana', 15, 'completed', 3100],
    ];
    for (const [first, daysAgo, status, spend] of past) {
      const cust = c(first);
      const arrival = day.minus({ days: daysAgo }).set({ hour: 19 });
      await tx.insert(s.reservations).values({
        restaurantId: rid,
        customerId: cust.id,
        firstName: cust.firstName,
        lastName: cust.lastName,
        phone: cust.phone,
        covers: 2 + (daysAgo % 4),
        arrivalAt: arrival.toJSDate(),
        departureAt: arrival.plus({ hours: 2 }).toJSDate(),
        status,
        source: 'phone',
        language: cust.language ?? 'sr',
        guestToken: guestToken(),
        spend,
        seatedAt: status === 'completed' ? arrival.toJSDate() : null,
        completedAt: status === 'completed' ? arrival.plus({ hours: 2 }).toJSDate() : null,
      });
    }

    await tx.insert(s.waitingEntries).values([
      { restaurantId: rid, guestName: 'Dragan', phone: normalizePhone('064 123 4567'), covers: 2 },
      { restaurantId: rid, guestName: 'Familija Ristić', covers: 4, notes: 'Two kids' },
    ]);

    return { restaurant, users: userRows, password };
  });
}

async function main() {
  const reset = process.argv.includes('--reset');
  const { db, pool } = createDb(env().DATABASE_URL);
  try {
    const slug = process.env.SEED_SLUG ?? 'restoran';
    const [existing] = await db.select().from(s.restaurants).where(eq(s.restaurants.slug, slug));
    if (existing && !reset) {
      console.log(`Restaurant "${slug}" already exists. Run with --reset to wipe and reseed.`);
      return;
    }
    if (existing) await db.execute(sql`delete from restaurants where id = ${existing.id}`);
    const result = await seed(db);
    console.log(`Seeded restaurant "${result.restaurant.name}" (/book/${result.restaurant.slug})`);
    for (const u of result.users) console.log(`  ${u.role.padEnd(5)} ${u.email}  password: ${result.password}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
