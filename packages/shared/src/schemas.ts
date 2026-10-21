import { z } from 'zod';
import {
  CUSTOMER_TYPES,
  LANGUAGES,
  PURPOSES,
  RESERVATION_SOURCES,
  RESERVATION_STATUSES,
  ROLES,
  TABLE_SHAPES,
  TAG_KINDS,
  WAITING_STATUSES,
} from './enums';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const uuid = z.uuid();
const optionalEmail = z
  .union([z.email(), z.literal('')])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const shiftSchema = z.object({
  name: z.string().trim().min(1).max(40),
  open: hhmm,
  /** A close time at or before `open` means the shift ends after midnight. */
  close: hhmm,
});
export type Shift = z.infer<typeof shiftSchema>;

/** Keys are ISO weekdays: 1 = Monday ... 7 = Sunday. */
export const openingHoursSchema = z.partialRecord(z.enum(['1', '2', '3', '4', '5', '6', '7']), z.array(shiftSchema));
export type OpeningHours = z.infer<typeof openingHoursSchema>;

export const durationRuleSchema = z.object({
  upToCovers: z.int().min(1).max(500),
  minutes: z.int().min(15).max(24 * 60),
});
export type DurationRule = z.infer<typeof durationRuleSchema>;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a color like #1a2b3c');

/** Font families for the booking page; system fonts only, so nothing extra loads. */
export const BOOKING_FONTS = ['modern', 'classic', 'friendly'] as const;
export type BookingFont = (typeof BOOKING_FONTS)[number];

/** Look of the public booking page. null colors = Hostly defaults. */
export const bookingThemeSchema = z.object({
  backgroundColor: hexColor.nullable(),
  accentColor: hexColor.nullable(),
  font: z.enum(BOOKING_FONTS),
});
export type BookingTheme = z.infer<typeof bookingThemeSchema>;
export const DEFAULT_BOOKING_THEME: BookingTheme = { backgroundColor: null, accentColor: null, font: 'modern' };

/** Images a restaurant can upload for its booking page. */
export const BRANDING_IMAGES = ['cover', 'logo'] as const;
export type BrandingImage = (typeof BRANDING_IMAGES)[number];

export const onlineSettingsSchema = z.object({
  enabled: z.boolean(),
  maxPartySize: z.int().min(1).max(500),
  slotMinutes: z.int().min(5).max(120),
  durations: z.array(durationRuleSchema),
  leadTimeMinutes: z.int().min(0).max(7 * 24 * 60),
  daysAhead: z.int().min(1).max(365),
  lastArrivalBeforeCloseMinutes: z.int().min(0).max(600),
  blockedDates: z.array(isoDate),
  /** Max online covers per shift name. Missing shift = unlimited (tables still apply). */
  shiftCapacity: z.record(z.string(), z.int().min(0)),
  pacingMaxReservationsPerSlot: z.int().min(0).nullable(),
  pacingMaxCoversPerSlot: z.int().min(0).nullable(),
  instagramUrl: z.string().max(300).nullable(),
  websiteUrl: z.string().max(300).nullable(),
  intro: z.string().max(1000).nullable(),
  theme: bookingThemeSchema.default(DEFAULT_BOOKING_THEME),
});
export type OnlineSettings = z.infer<typeof onlineSettingsSchema>;

export const DEFAULT_ONLINE_SETTINGS: OnlineSettings = {
  enabled: true,
  maxPartySize: 8,
  slotMinutes: 15,
  durations: [
    { upToCovers: 2, minutes: 90 },
    { upToCovers: 4, minutes: 120 },
    { upToCovers: 500, minutes: 150 },
  ],
  leadTimeMinutes: 60,
  daysAhead: 60,
  lastArrivalBeforeCloseMinutes: 60,
  blockedDates: [],
  shiftCapacity: {},
  pacingMaxReservationsPerSlot: null,
  pacingMaxCoversPerSlot: null,
  instagramUrl: null,
  websiteUrl: null,
  intro: null,
  theme: DEFAULT_BOOKING_THEME,
};

export const restaurantSettingsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: z.string().min(1),
  defaultLanguage: z.enum(LANGUAGES),
  openingHours: openingHoursSchema,
  /** Business day boundary, e.g. 06:00 means the day runs 06:00 - 05:59. */
  dayStart: hhmm,
  defaultDurationMin: z.int().min(15).max(24 * 60),
  slotMinutes: z.int().min(5).max(60),
  maxPartySize: z.int().min(1).max(500),
  pacingMaxReservationsPerSlot: z.int().min(0).nullable(),
  pacingMaxCoversPerSlot: z.int().min(0).nullable(),
  email: optionalEmail,
  phone: optionalText,
  address: optionalText,
});
export type RestaurantSettingsInput = z.infer<typeof restaurantSettingsSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userCreateSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  password: z.string().min(8).max(200),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const areaSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sort: z.int().default(0),
});
export type AreaInput = z.infer<typeof areaSchema>;

export const tableSchema = z
  .object({
    id: uuid.optional(),
    areaId: uuid,
    label: z.string().trim().min(1).max(20),
    shape: z.enum(TABLE_SHAPES),
    x: z.number(),
    y: z.number(),
    w: z.number().min(20).max(1000),
    h: z.number().min(20).max(1000),
    rotation: z.number().min(-360).max(360),
    minSeats: z.int().min(1).max(100),
    maxSeats: z.int().min(1).max(100),
    rating: z.int().min(1).max(10),
    active: z.boolean().default(true),
  })
  .refine((t) => t.minSeats <= t.maxSeats, { message: 'minSeats must be <= maxSeats', path: ['minSeats'] });
export type TableInput = z.infer<typeof tableSchema>;

/** Saves an area's whole layout at once (editor "Save"). */
export const floorPlanSaveSchema = z.object({
  areaId: uuid,
  tables: z.array(tableSchema),
  deletedTableIds: z.array(uuid).default([]),
});
export type FloorPlanSaveInput = z.infer<typeof floorPlanSaveSchema>;

export const joinGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  tableIds: z.array(uuid).min(2),
});
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;

export const customerSchema = z.object({
  firstName: optionalText,
  lastName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  language: z.enum(LANGUAGES).nullable().optional(),
  birthday: isoDate.nullable().optional(),
  company: optionalText,
  type: z.enum(CUSTOMER_TYPES).default('regular'),
  notes: optionalText,
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  averageSpend: z.number().min(0).nullable().optional(),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const reservationExtrasSchema = z.object({
  cake: z.boolean().optional(),
  smoking: z.boolean().optional(),
  discount: z.string().max(40).optional(),
});
export type ReservationExtras = z.infer<typeof reservationExtrasSchema>;

export const reservationSchema = z.object({
  status: z.enum(RESERVATION_STATUSES).default('confirmed'),
  purpose: z.enum(PURPOSES).default('food'),
  /** ISO datetime with offset, or local "YYYY-MM-DDTHH:mm" in restaurant timezone. */
  arrivalAt: z.string().min(16),
  departureAt: z.string().min(16).nullable().optional(),
  covers: z.int().min(1).max(500),
  firstName: optionalText,
  lastName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  customerId: uuid.nullable().optional(),
  areaId: uuid.nullable().optional(),
  tableIds: z.array(uuid).default([]),
  source: z.enum(RESERVATION_SOURCES).default('phone'),
  notes: optionalText,
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  dietary: z.array(z.string().trim().min(1).max(40)).default([]),
  fixMenu: z.boolean().default(false),
  language: z.enum(LANGUAGES).nullable().optional(),
  birthday: isoDate.nullable().optional(),
  extras: reservationExtrasSchema.default({}),
  spend: z.number().min(0).nullable().optional(),
  /** Skip pacing/opening-hour checks (owner/host override after a warning). */
  force: z.boolean().default(false),
});
export type ReservationInput = z.input<typeof reservationSchema>;
export type ReservationParsed = z.infer<typeof reservationSchema>;

export const reservationPatchSchema = reservationSchema.partial().extend({
  force: z.boolean().default(false),
});
export type ReservationPatchInput = z.input<typeof reservationPatchSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(RESERVATION_STATUSES),
  reason: z.string().max(500).optional(),
});
export type StatusChangeInput = z.infer<typeof statusChangeSchema>;

export const moveReservationSchema = z.object({
  tableIds: z.array(uuid),
  arrivalAt: z.string().min(16).optional(),
  departureAt: z.string().min(16).optional(),
});
export type MoveReservationInput = z.infer<typeof moveReservationSchema>;

export const suggestQuerySchema = z.object({
  arrivalAt: z.string().min(16),
  departureAt: z.string().min(16).optional(),
  covers: z.coerce.number().int().min(1),
  customerId: uuid.optional(),
  areaId: uuid.optional(),
  excludeReservationId: uuid.optional(),
});
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;

export const waitingEntrySchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  phone: optionalText,
  covers: z.int().min(1).max(100),
  notes: optionalText,
});
export type WaitingEntryInput = z.infer<typeof waitingEntrySchema>;

export const waitingPatchSchema = z.object({
  status: z.enum(WAITING_STATUSES).optional(),
  notified: z.boolean().optional(),
  tableIds: z.array(uuid).optional(),
});
export type WaitingPatchInput = z.infer<typeof waitingPatchSchema>;

export const tagSchema = z.object({
  kind: z.enum(TAG_KINDS),
  label: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b'),
});
export type TagInput = z.infer<typeof tagSchema>;

export const declineSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const publicBookingSchema = z.object({
  date: isoDate,
  time: hhmm,
  covers: z.int().min(1).max(500),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(40),
  email: z.email(),
  notes: z.string().trim().max(1000).optional(),
  language: z.enum(LANGUAGES).optional(),
  /** Honeypot: real users never fill this hidden field; the API fakes success when it is set. */
  website: z.string().max(500).optional(),
});
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

export const availabilityQuerySchema = z.object({
  date: isoDate,
  covers: z.coerce.number().int().min(1),
});
