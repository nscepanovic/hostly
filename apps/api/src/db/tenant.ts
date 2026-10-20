import bcrypt from 'bcryptjs';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { DEFAULT_ONLINE_SETTINGS, type Language, type OpeningHours, type OnlineSettings } from '@hostly/shared';
import type { DbOrTx } from './client';
import * as s from './schema';
import { emailIndex } from '../common/crypto';
import { customerIndexes } from '../customers/customer-indexes';

/** Lunch + dinner every day; owners adjust it in Settings. */
export const DEFAULT_OPENING_HOURS: OpeningHours = Object.fromEntries(
  ['1', '2', '3', '4', '5', '6', '7'].map((d) => [
    d,
    [
      { name: 'lunch', open: '12:00', close: '16:00' },
      { name: 'dinner', open: '16:00', close: '23:00' },
    ],
  ]),
);

export const DEFAULT_TAGS: Array<[kind: 'note' | 'dietary' | 'customer', label: string, color: string]> = [
  ['note', 'birthday', '#ec4899'],
  ['note', 'anniversary', '#f43f5e'],
  ['note', 'business', '#0ea5e9'],
  ['note', 'window seat', '#14b8a6'],
  ['note', 'high chair', '#f59e0b'],
  ['dietary', 'vegan', '#22c55e'],
  ['dietary', 'vegetarian', '#84cc16'],
  ['dietary', 'gluten free', '#eab308'],
  ['dietary', 'lactose free', '#a855f7'],
  ['dietary', 'nut allergy', '#ef4444'],
  ['customer', 'regular', '#64748b'],
  ['customer', 'wine lover', '#9333ea'],
];

export interface NewRestaurant {
  name: string;
  slug: string;
  owner: { email: string; name: string; password: string };
  timezone?: string;
  defaultLanguage?: Language;
  areaName?: string;
  openingHours?: OpeningHours;
  onlineSettings?: Partial<OnlineSettings>;
  extra?: Partial<typeof s.restaurants.$inferInsert>;
  /** Join an existing guest book (share guests from day one). Default: a new private book. */
  guestBookId?: string;
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/**
 * Creates a tenant: restaurant, owner account, one empty area and the default
 * tags. Run inside a transaction so a failure leaves nothing behind.
 */
export async function createRestaurant(tx: DbOrTx, input: NewRestaurant) {
  if (!SLUG_RE.test(input.slug)) throw new Error(`Invalid slug "${input.slug}": use lowercase letters, digits and dashes`);
  if (input.owner.password.length < 8) throw new Error('Owner password must be at least 8 characters');

  const guestBookId =
    input.guestBookId ?? (await tx.insert(s.guestBooks).values({ name: input.name }).returning({ id: s.guestBooks.id }))[0].id;

  const [restaurant] = await tx
    .insert(s.restaurants)
    .values({
      guestBookId,
      slug: input.slug,
      name: input.name,
      timezone: input.timezone ?? 'Europe/Belgrade',
      defaultLanguage: input.defaultLanguage ?? 'sr',
      openingHours: input.openingHours ?? DEFAULT_OPENING_HOURS,
      onlineSettings: { ...DEFAULT_ONLINE_SETTINGS, ...input.onlineSettings },
      ...input.extra,
    })
    .returning();

  const [owner] = await tx
    .insert(s.users)
    .values({
      restaurantId: restaurant.id,
      email: input.owner.email.toLowerCase(),
      emailIndex: emailIndex(input.owner.email)!,
      name: input.owner.name,
      role: 'owner',
      passwordHash: await bcrypt.hash(input.owner.password, 10),
    })
    .returning();

  const [area] = await tx
    .insert(s.areas)
    .values({ restaurantId: restaurant.id, name: input.areaName ?? (restaurant.defaultLanguage === 'sr' ? 'Sala' : 'Main room'), sort: 0 })
    .returning();

  await tx.insert(s.tags).values(DEFAULT_TAGS.map(([kind, label, color]) => ({ restaurantId: restaurant.id, kind, label, color })));

  return { restaurant, owner, area };
}

const TYPE_RANK: Record<string, number> = { regular: 0, vip: 1, svip: 2, blacklisted: 3 };

/**
 * Moves `restaurantId` into the guest book of `targetRestaurantId`, so both see
 * the same guests. Guests with the same phone are merged into one record
 * (history, tags and notes combined, the stricter type kept); the rest move over.
 * Run inside a transaction.
 */
export async function shareGuests(tx: DbOrTx, restaurantId: string, targetRestaurantId: string) {
  const [source] = await tx.select().from(s.restaurants).where(eq(s.restaurants.id, restaurantId));
  const [target] = await tx.select().from(s.restaurants).where(eq(s.restaurants.id, targetRestaurantId));
  if (!source || !target) throw new Error('Restaurant not found');
  if (source.guestBookId === target.guestBookId) return { merged: 0, moved: 0, guestBookId: target.guestBookId };

  const fromBook = source.guestBookId;
  const toBook = target.guestBookId;
  // Everyone else sharing the source book comes along, so a group never splits by accident.
  const movingRestaurants = await tx.select({ id: s.restaurants.id }).from(s.restaurants).where(eq(s.restaurants.guestBookId, fromBook));

  const incoming = await tx.select().from(s.customers).where(eq(s.customers.guestBookId, fromBook));
  // Phones are encrypted: match on their blind index.
  const phoneKeys = incoming.map((c) => c.phoneIndex).filter((p): p is string => !!p);
  const existing = phoneKeys.length
    ? await tx
        .select()
        .from(s.customers)
        .where(and(eq(s.customers.guestBookId, toBook), inArray(s.customers.phoneIndex, phoneKeys)))
    : [];
  const byPhone = new Map(existing.map((c) => [c.phoneIndex!, c]));

  let merged = 0;
  for (const c of incoming) {
    const twin = c.phoneIndex ? byPhone.get(c.phoneIndex) : undefined;
    if (!twin) continue;
    await tx.update(s.reservations).set({ customerId: twin.id }).where(eq(s.reservations.customerId, c.id));
    const contact = {
      firstName: twin.firstName ?? c.firstName,
      lastName: twin.lastName ?? c.lastName,
      phone: twin.phone,
      email: twin.email ?? c.email,
    };
    await tx
      .update(s.customers)
      .set({
        ...contact,
        ...customerIndexes(contact),
        language: twin.language ?? c.language,
        birthday: twin.birthday ?? c.birthday,
        company: twin.company ?? c.company,
        type: TYPE_RANK[c.type] > TYPE_RANK[twin.type] ? c.type : twin.type,
        tags: [...new Set([...twin.tags, ...c.tags])],
        notes: [twin.notes, c.notes].filter(Boolean).join('\n') || null,
        averageSpend: twin.averageSpend ?? c.averageSpend,
      })
      .where(eq(s.customers.id, twin.id));
    await tx.delete(s.customers).where(eq(s.customers.id, c.id));
    merged++;
  }

  const moved = await tx
    .update(s.customers)
    .set({ guestBookId: toBook })
    .where(eq(s.customers.guestBookId, fromBook))
    .returning({ id: s.customers.id });
  await tx.update(s.restaurants).set({ guestBookId: toBook }).where(eq(s.restaurants.guestBookId, fromBook));
  await tx.delete(s.guestBooks).where(eq(s.guestBooks.id, fromBook));
  return { merged, moved: moved.length, guestBookId: toBook, restaurants: movingRestaurants.length };
}

/**
 * Takes a restaurant out of a shared guest book. It gets a private book with a
 * copy of every guest who has a reservation there or was first recorded there;
 * the shared book keeps its guests. Run inside a transaction.
 */
export async function unshareGuests(tx: DbOrTx, restaurantId: string) {
  const [r] = await tx.select().from(s.restaurants).where(eq(s.restaurants.id, restaurantId));
  if (!r) throw new Error('Restaurant not found');
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(s.restaurants)
    .where(eq(s.restaurants.guestBookId, r.guestBookId));
  if (count <= 1) return { copied: 0, guestBookId: r.guestBookId };

  const [book] = await tx.insert(s.guestBooks).values({ name: r.name }).returning();
  const own = await tx
    .selectDistinct({ c: s.customers })
    .from(s.customers)
    .leftJoin(s.reservations, and(eq(s.reservations.customerId, s.customers.id), eq(s.reservations.restaurantId, restaurantId)))
    .where(
      and(
        eq(s.customers.guestBookId, r.guestBookId),
        or(eq(s.customers.restaurantId, restaurantId), sql`${s.reservations.id} is not null`),
      ),
    );
  for (const { c } of own) {
    const { id: oldId, guestBookId: _old, createdAt: _created, ...rest } = c;
    const [copy] = await tx.insert(s.customers).values({ ...rest, guestBookId: book.id }).returning({ id: s.customers.id });
    await tx
      .update(s.reservations)
      .set({ customerId: copy.id })
      .where(and(eq(s.reservations.customerId, oldId), eq(s.reservations.restaurantId, restaurantId)));
  }
  await tx.update(s.restaurants).set({ guestBookId: book.id }).where(eq(s.restaurants.id, restaurantId));
  return { copied: own.length, guestBookId: book.id };
}

/** Restaurants that see the same guests as `restaurantId` (itself included). */
export async function guestBookRestaurants(tx: DbOrTx, guestBookId: string) {
  return tx
    .select({ id: s.restaurants.id, name: s.restaurants.name, slug: s.restaurants.slug })
    .from(s.restaurants)
    .where(eq(s.restaurants.guestBookId, guestBookId));
}



/** Creates a Hostly operator account (admin panel at /admin). */
export async function createPlatformAdmin(tx: DbOrTx, input: { email: string; name: string; password: string }) {
  if (input.password.length < 10) throw new Error('Admin password must be at least 10 characters');
  const [admin] = await tx
    .insert(s.platformAdmins)
    .values({
      email: input.email.toLowerCase(),
      emailIndex: emailIndex(input.email)!,
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, 12),
    })
    .returning();
  return admin;
}
