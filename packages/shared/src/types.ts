import type {
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
import type { OnlineSettings, OpeningHours, ReservationExtras } from './schemas';

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
