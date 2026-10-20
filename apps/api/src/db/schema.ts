import { sql } from 'drizzle-orm';
import { decrypt, encrypt } from '../common/crypto';
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  CustomerType,
  Language,
  MessageChannel,
  MessageStatus,
  MessageTemplate,
  OnlineSettings,
  OpeningHours,
  Purpose,
  ReservationExtras,
  ReservationSource,
  ReservationStatus,
  Role,
  TableShape,
  TagKind,
  WaitingStatus,
} from '@hostly/shared';

/** Personal data: AES-256-GCM encrypted on write, decrypted on read (see common/crypto.ts). */
const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => encrypt(value),
  fromDriver: (value) => decrypt(value),
});

/** Encrypted JSON document (audit snapshots contain personal data). */
const encryptedJson = customType<{ data: unknown; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => encrypt(JSON.stringify(value)),
  fromDriver: (value) => JSON.parse(decrypt(value)),
});

/** Postgres tstzrange, written as '[from,to)'. Only used for the double-booking exclusion constraint. */
const tstzrange = customType<{ data: string }>({ dataType: () => 'tstzrange' });

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const restaurantRef = () =>
  uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' });

/**
 * A guest database. Each restaurant has one; restaurants that share guests
 * (e.g. locations of one owner) point to the same book. Guests never cross books.
 */
export const guestBooks = pgTable('guest_books', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const restaurants = pgTable('restaurants', {
  id: id(),
  guestBookId: uuid('guest_book_id')
    .notNull()
    .references(() => guestBooks.id),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Belgrade'),
  defaultLanguage: text('default_language').$type<Language>().notNull().default('sr'),
  openingHours: jsonb('opening_hours').$type<OpeningHours>().notNull().default({}),
  dayStart: text('day_start').notNull().default('06:00'),
  defaultDurationMin: integer('default_duration_min').notNull().default(120),
  slotMinutes: integer('slot_minutes').notNull().default(15),
  maxPartySize: integer('max_party_size').notNull().default(20),
  pacingMaxReservationsPerSlot: integer('pacing_max_reservations_per_slot'),
  pacingMaxCoversPerSlot: integer('pacing_max_covers_per_slot'),
  onlineSettings: jsonb('online_settings').$type<OnlineSettings>().notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  /** Set by a platform admin: staff cannot sign in and the booking page is closed. */
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    restaurantId: restaurantRef(),
    email: encryptedText('email').notNull(),
    /** Blind index of the lowercased email: login lookup and uniqueness. */
    emailIndex: text('email_bidx').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: encryptedText('name').notNull(),
    role: text('role').$type<Role>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_bidx_uq').on(t.emailIndex)],
);

export const areas = pgTable(
  'areas',
  {
    id: id(),
    restaurantId: restaurantRef(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('areas_restaurant_idx').on(t.restaurantId)],
);

export const tables = pgTable(
  'tables',
  {
    id: id(),
    restaurantId: restaurantRef(),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    shape: text('shape').$type<TableShape>().notNull().default('rect'),
    x: real('x').notNull().default(0),
    y: real('y').notNull().default(0),
    w: real('w').notNull().default(80),
    h: real('h').notNull().default(80),
    rotation: real('rotation').notNull().default(0),
    minSeats: integer('min_seats').notNull().default(1),
    maxSeats: integer('max_seats').notNull().default(2),
    rating: integer('rating').notNull().default(5),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('tables_restaurant_idx').on(t.restaurantId), index('tables_area_idx').on(t.areaId)],
);

export const tableJoinGroups = pgTable('table_join_groups', {
  id: id(),
  restaurantId: restaurantRef(),
  name: text('name').notNull(),
  tableIds: uuid('table_ids').array().notNull(),
});

export const customers = pgTable(
  'customers',
  {
    id: id(),
    /** The guest book this guest lives in: every customer query is scoped by it. */
    guestBookId: uuid('guest_book_id')
      .notNull()
      .references(() => guestBooks.id, { onDelete: 'cascade' }),
    /** Restaurant where the guest was first recorded (informational). */
    restaurantId: restaurantRef(),
    firstName: encryptedText('first_name'),
    lastName: encryptedText('last_name'),
    phone: encryptedText('phone'),
    email: encryptedText('email'),
    language: text('language').$type<Language>(),
    /** YYYY-MM-DD, encrypted. */
    birthday: encryptedText('birthday'),
    company: encryptedText('company'),
    type: text('type').$type<CustomerType>().notNull().default('regular'),
    notes: encryptedText('notes'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    averageSpend: numeric('average_spend', { mode: 'number' }),
    /** Blind indexes (see common/crypto.ts): exact phone/email lookup and name/email/phone search. */
    phoneIndex: text('phone_bidx'),
    emailIndex: text('email_bidx'),
    searchTokens: text('search_tokens').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('customers_phone_bidx_uq').on(t.guestBookId, t.phoneIndex),
    index('customers_email_bidx_idx').on(t.guestBookId, t.emailIndex),
    index('customers_search_idx').using('gin', t.searchTokens),
  ],
);

export const reservations = pgTable(
  'reservations',
  {
    id: id(),
    restaurantId: restaurantRef(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    firstName: encryptedText('first_name'),
    lastName: encryptedText('last_name'),
    phone: encryptedText('phone'),
    email: encryptedText('email'),
    covers: integer('covers').notNull(),
    arrivalAt: timestamp('arrival_at', { withTimezone: true }).notNull(),
    departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
    /** True when staff gave no end: departure is start + the party-size duration and follows changes. */
    departureEstimated: boolean('departure_estimated').notNull().default(false),
    purpose: text('purpose').$type<Purpose>().notNull().default('food'),
    status: text('status').$type<ReservationStatus>().notNull(),
    source: text('source').$type<ReservationSource>().notNull(),
    notes: encryptedText('notes'),
    dietary: text('dietary').array().notNull().default(sql`'{}'::text[]`),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    fixMenu: boolean('fix_menu').notNull().default(false),
    language: text('language').$type<Language>().notNull(),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    extras: jsonb('extras').$type<ReservationExtras>().notNull().default({}),
    spend: numeric('spend', { mode: 'number' }),
    declineReason: encryptedText('decline_reason'),
    /** Secret for the guest's confirm/cancel links. */
    guestToken: text('guest_token').notNull().unique(),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reservations_day_idx').on(t.restaurantId, t.arrivalAt),
    index('reservations_customer_idx').on(t.customerId),
    index('reservations_status_idx').on(t.restaurantId, t.status),
  ],
);

/**
 * Table assignment. `during` and `active` mirror the reservation so an exclusion
 * constraint (see the custom migration) can reject overlapping active bookings.
 */
export const reservationTables = pgTable(
  'reservation_tables',
  {
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    restaurantId: restaurantRef(),
    during: tstzrange('during').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.reservationId, t.tableId] }), index('reservation_tables_table_idx').on(t.tableId)],
);

export const waitingEntries = pgTable(
  'waiting_entries',
  {
    id: id(),
    restaurantId: restaurantRef(),
    guestName: encryptedText('guest_name').notNull(),
    phone: encryptedText('phone'),
    covers: integer('covers').notNull(),
    notes: encryptedText('notes'),
    status: text('status').$type<WaitingStatus>().notNull().default('waiting'),
    createdAt: createdAt(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [index('waiting_restaurant_idx').on(t.restaurantId, t.status)],
);

export const tags = pgTable(
  'tags',
  {
    id: id(),
    restaurantId: restaurantRef(),
    kind: text('kind').$type<TagKind>().notNull(),
    label: text('label').notNull(),
    color: text('color').notNull().default('#64748b'),
  },
  (t) => [uniqueIndex('tags_uq').on(t.restaurantId, t.kind, t.label)],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    restaurantId: restaurantRef(),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<MessageChannel>().notNull(),
    templateKey: text('template_key').$type<MessageTemplate>().notNull(),
    language: text('language').$type<Language>().notNull(),
    recipient: encryptedText('recipient').notNull(),
    status: text('status').$type<MessageStatus>().notNull().default('queued'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('messages_reservation_idx').on(t.reservationId)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    restaurantId: restaurantRef(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    before: encryptedJson('before'),
    after: encryptedJson('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entityId)],
);

/** Hostly operators. Separate from restaurant staff: no restaurant, own login at /admin. */
export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: id(),
    email: encryptedText('email').notNull(),
    emailIndex: text('email_bidx').notNull(),
    name: encryptedText('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('platform_admins_email_bidx_uq').on(t.emailIndex)],
);

/** Small key/value store for operational state (e.g. which blind-index key built the indexes). */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type PlatformAdminRow = typeof platformAdmins.$inferSelect;
export type GuestBookRow = typeof guestBooks.$inferSelect;
export type RestaurantRow = typeof restaurants.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type AreaRow = typeof areas.$inferSelect;
export type TableRow = typeof tables.$inferSelect;
export type JoinGroupRow = typeof tableJoinGroups.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type WaitingRow = typeof waitingEntries.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
