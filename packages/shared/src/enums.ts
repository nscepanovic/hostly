export const ROLES = ['owner', 'host'] as const;
export type Role = (typeof ROLES)[number];

export { LANGUAGES, type Language } from './languages';

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that hold a table for their time window. */
export const ACTIVE_STATUSES: readonly ReservationStatus[] = ['pending', 'confirmed', 'seated'];

export const RESERVATION_SOURCES = ['online', 'phone', 'walk_in', 'staff'] as const;
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];

export const PURPOSES = ['food', 'drink', 'food_drink'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const CUSTOMER_TYPES = ['regular', 'vip', 'svip', 'blacklisted'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const TABLE_SHAPES = ['round', 'rect'] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export const TAG_KINDS = ['note', 'dietary', 'customer'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const WAITING_STATUSES = ['waiting', 'seated', 'left'] as const;
export type WaitingStatus = (typeof WAITING_STATUSES)[number];

export const MESSAGE_CHANNELS = ['email', 'sms'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_TEMPLATES = [
  'request_received',
  'confirmed',
  'declined',
  'reminder',
  'cancelled',
] as const;
export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];

export const MESSAGE_STATUSES = ['queued', 'sent', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Allowed manual status transitions. */
export const STATUS_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['seated', 'cancelled', 'no_show', 'pending'],
  seated: ['completed', 'confirmed'],
  completed: ['seated'],
  cancelled: ['confirmed'],
  no_show: ['confirmed', 'seated'],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}
