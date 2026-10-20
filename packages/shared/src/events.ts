import type { ReservationDto, WaitingEntryDto } from './types';

/** Socket.IO event names. Clients join one room per restaurant on connect. */
export const WS_EVENTS = {
  reservationCreated: 'reservation.created',
  reservationUpdated: 'reservation.updated',
  reservationDeleted: 'reservation.deleted',
  tableStatus: 'table.status',
  waitingUpdated: 'waiting.updated',
  waitingSuggest: 'waiting.suggest',
  priorityNew: 'priority.new',
  floorPlanUpdated: 'floorplan.updated',
  customerUpdated: 'customer.updated',
  settingsUpdated: 'settings.updated',
} as const;

export interface WsEventPayloads {
  'reservation.created': { reservation: ReservationDto };
  'reservation.updated': { reservation: ReservationDto };
  'reservation.deleted': { id: string };
  'table.status': { tableIds: string[] };
  'waiting.updated': { entry?: WaitingEntryDto; id?: string };
  /** A table freed up and this waiting entry fits it. */
  'waiting.suggest': { entry: WaitingEntryDto; tableIds: string[]; labels: string[] };
  'priority.new': { reservation: ReservationDto };
  'floorplan.updated': { areaId?: string };
  'customer.updated': { id: string };
  'settings.updated': Record<string, never>;
}
