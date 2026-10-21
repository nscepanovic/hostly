import type {
  PaymentMethod,
  ReceiptStatus,
  ReceiptTransactionType,
  CustomerType,
  Language,
  MessageChannel,
  MessageStatus,
  MessageTemplate,
  Purpose,
  ReservationSource,
  ReservationStatus,
  Role,
  TableShape,
  TagKind,
  WaitingStatus,
} from './enums';
import type { BookingTheme, BrandingImage, OnlineSettings, OpeningHours, ReservationExtras } from './schemas';

export interface UserDto {
  id: string;
  restaurantId: string;
  email: string;
  name: string;
  role: Role;
}

export interface RestaurantDto {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  defaultLanguage: Language;
  openingHours: OpeningHours;
  dayStart: string;
  defaultDurationMin: number;
  slotMinutes: number;
  maxPartySize: number;
  pacingMaxReservationsPerSlot: number | null;
  pacingMaxCoversPerSlot: number | null;
  onlineSettings: OnlineSettings;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Other restaurants that share this restaurant's guest database (empty = private). */
  sharesGuestsWith: Array<{ name: string; slug: string }>;
  /** Booking page images (URL, or null when not uploaded). */
  images: Record<BrandingImage, string | null>;
}

/** What guest-facing pages need to look like the restaurant. */
export interface PublicBranding {
  theme: BookingTheme;
  images: Record<BrandingImage, string | null>;
}

export interface AreaDto {
  id: string;
  name: string;
  sort: number;
}

export interface TableDto {
  id: string;
  areaId: string;
  label: string;
  shape: TableShape;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  minSeats: number;
  maxSeats: number;
  rating: number;
  active: boolean;
}

export interface JoinGroupDto {
  id: string;
  name: string;
  tableIds: string[];
}

export interface CustomerStats {
  visits: number;
  cancellations: number;
  noShows: number;
  lastVisitAt: string | null;
}

export interface CustomerDto {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  language: Language | null;
  birthday: string | null;
  company: string | null;
  type: CustomerType;
  notes: string | null;
  tags: string[];
  averageSpend: number | null;
  createdAt: string;
  stats: CustomerStats;
}

export interface ReservationDto {
  id: string;
  customerId: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  covers: number;
  arrivalAt: string;
  departureAt: string;
  /** No end was given: departureAt is estimated from the party-size duration. */
  departureEstimated: boolean;
  purpose: Purpose;
  status: ReservationStatus;
  source: ReservationSource;
  notes: string | null;
  dietary: string[];
  tags: string[];
  fixMenu: boolean;
  language: Language;
  areaId: string | null;
  tableIds: string[];
  extras: ReservationExtras;
  spend: number | null;
  declineReason: string | null;
  seatedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  customerType: CustomerType | null;
}

export interface WaitingEntryDto {
  id: string;
  guestName: string;
  phone: string | null;
  covers: number;
  notes: string | null;
  status: WaitingStatus;
  createdAt: string;
  notifiedAt: string | null;
}

export interface TagDto {
  id: string;
  kind: TagKind;
  label: string;
  color: string;
}

export interface MessageDto {
  id: string;
  reservationId: string;
  channel: MessageChannel;
  templateKey: MessageTemplate;
  language: Language;
  status: MessageStatus;
  recipient: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

export type SuggestionKind = 'single' | 'join_group' | 'ad_hoc';

export interface TableSuggestion {
  kind: SuggestionKind;
  tableIds: string[];
  labels: string[];
  capacity: { min: number; max: number };
  joinGroupId?: string;
}

export interface ValidationIssue {
  code:
    | 'closed'
    | 'max_party_size'
    | 'pacing_reservations'
    | 'pacing_covers'
    | 'table_conflict'
    | 'table_capacity'
    | 'past';
  message: string;
  /** Hard issues block saving even with `force`. */
  hard: boolean;
}

export interface DaySummary {
  reservations: number;
  covers: number;
  withoutTable: number;
}

export interface SlotPace {
  /** Slot start, ISO. */
  at: string;
  reservations: number;
  covers: number;
}

export interface PublicRestaurantInfo {
  slug: string;
  name: string;
  timezone: string;
  defaultLanguage: Language;
  maxPartySize: number;
  daysAhead: number;
  blockedDates: string[];
  instagramUrl: string | null;
  websiteUrl: string | null;
  intro: string | null;
  enabled: boolean;
  branding: PublicBranding;
}

export interface PublicSlot {
  time: string;
  available: boolean;
}

export interface PublicReservationView {
  restaurantName: string;
  status: ReservationStatus;
  arrivalAt: string;
  covers: number;
  firstName: string | null;
  language: Language;
  timezone: string;
  branding: PublicBranding;
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  userName: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

// ---------- platform admin ----------

export interface AdminUserDto {
  id: string;
  email: string;
  name: string;
}

export interface DailyPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  reservations: number;
  online: number;
  covers: number;
}

export interface AdminOverviewDto {
  restaurants: { total: number; suspended: number; activeLast7d: number };
  staffUsers: number;
  guests: number;
  reservations: { last24h: number; last7d: number; last30d: number; covers30d: number; onlineShare30d: number; noShowRate30d: number };
  pendingOnline: number;
  emails24h: { sent: number; failed: number };
  connectedDevices: number;
  system: { dbOk: boolean; dbLatencyMs: number; uptimeSec: number; memoryMb: number; node: string; version: string; startedAt: string };
  perDay: DailyPoint[];
}

export interface AdminRestaurantRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  suspendedAt: string | null;
  onlineEnabled: boolean;
  staff: number;
  tables: number;
  guests: number;
  reservations30d: number;
  covers30d: number;
  lastActivityAt: string | null;
  connectedDevices: number;
  sharesGuestsWith: Array<{ id: string; name: string }>;
}

export interface AdminActivityDto {
  id: string;
  at: string;
  restaurantId: string;
  restaurantName: string;
  userName: string | null;
  entity: string;
  action: string;
}

export interface AdminMessageDto {
  id: string;
  createdAt: string;
  restaurantId: string;
  restaurantName: string;
  templateKey: string;
  language: string;
  status: string;
  /** Masked (j***@example.com): the admin panel does not show guest personal data. */
  recipient: string;
  error: string | null;
}

export interface AdminRestaurantDetail extends AdminRestaurantRow {
  timezone: string;
  email: string | null;
  phone: string | null;
  users: Array<UserDto & { createdAt: string }>;
  perDay: DailyPoint[];
  activity: AdminActivityDto[];
  failedMessages: AdminMessageDto[];
}

export interface ReceiptPayment {
  method: PaymentMethod;
  amount: number;
}

export interface ReceiptItemDto {
  name: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  vatLabel: string | null;
}

export interface ReceiptDto {
  id: string;
  reservationId: string | null;
  invoiceNumber: string;
  verificationUrl: string;
  issuedAt: string;
  /** Positive for sales, negative for refunds. */
  total: number;
  transactionType: ReceiptTransactionType;
  sellerName: string | null;
  sellerTin: string | null;
  payments: ReceiptPayment[];
  status: ReceiptStatus;
  error: string | null;
  items: ReceiptItemDto[];
  createdAt: string;
  /** Guest and table of the linked reservation, for lists. */
  guestName: string | null;
  covers: number | null;
}

/** What a guest orders and spends, from their receipts. */
export interface CustomerInsights {
  receipts: number;
  totalSpent: number;
  averagePerVisit: number | null;
  averagePerCover: number | null;
  favoriteItems: Array<{ name: string; quantity: number; times: number; total: number }>;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  lastReceipt: ReceiptDto | null;
}

export interface AnalyticsDto {
  from: string;
  to: string;
  revenue: number;
  receipts: number;
  averageReceipt: number | null;
  /** Covers of reservations that have a receipt, for revenue per guest. */
  coversWithReceipt: number;
  revenuePerCover: number | null;
  /** Completed reservations that have at least one receipt (scan coverage). */
  completedReservations: number;
  completedWithReceipt: number;
  byDay: Array<{ date: string; revenue: number; receipts: number }>;
  byHour: Array<{ hour: number; revenue: number; receipts: number }>;
  byWeekday: Array<{ weekday: number; revenue: number; receipts: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number; receipts: number }>;
  /** Best sellers per shift (lunch, dinner...), by revenue. */
  itemsByShift: Array<{ shift: string; items: Array<{ name: string; quantity: number; revenue: number }> }>;
  payments: Array<{ method: PaymentMethod; amount: number }>;
}
