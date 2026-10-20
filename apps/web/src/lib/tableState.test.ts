import { describe, expect, it } from 'vitest';
import type { ReservationDto } from '@hostly/shared';
import { computeTableStatuses } from './tableState';

const base: ReservationDto = {
  id: 'r',
  customerId: null,
  firstName: null,
  lastName: 'Guest',
  phone: null,
  email: null,
  covers: 2,
  arrivalAt: '2026-10-20T18:00:00.000Z',
  departureAt: '2026-10-20T20:00:00.000Z',
  departureEstimated: false,
  purpose: 'food',
  status: 'confirmed',
  source: 'phone',
  notes: null,
  dietary: [],
  tags: [],
  fixMenu: false,
  language: 'sr',
  areaId: null,
  tableIds: ['t1'],
  extras: {},
  spend: null,
  declineReason: null,
  seatedAt: null,
  completedAt: null,
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  customerType: null,
};
const r = (p: Partial<ReservationDto>): ReservationDto => ({ ...base, ...p });

describe('computeTableStatuses', () => {
  it('shows the next booking as reserved', () => {
    const s = computeTableStatuses([r({ id: 'a' })], new Date('2026-10-20T17:00:00Z')).get('t1')!;
    expect(s.state).toBe('reserved');
    expect(s.reservation?.id).toBe('a');
  });

  it('shows a table as free until a booking that is more than an hour away', () => {
    const s = computeTableStatuses([r({ id: 'a' })], new Date('2026-10-20T15:00:00Z')).get('t1')!;
    expect(s.state).toBe('free');
    expect(s.reservation).toBeNull();
    expect(s.freeUntil).toBe('2026-10-20T18:00:00.000Z');
    expect(s.upcoming.map((x) => x.id)).toEqual(['a']);
  });

  it('lists every later booking of the day as coming up', () => {
    const day = [
      r({ id: 'b', arrivalAt: '2026-10-20T20:00:00.000Z', departureAt: '2026-10-20T21:30:00.000Z' }),
      r({ id: 'a' }),
      r({ id: 'c', arrivalAt: '2026-10-20T22:00:00.000Z', departureAt: '2026-10-20T23:30:00.000Z' }),
    ];
    const s = computeTableStatuses(day, new Date('2026-10-20T17:30:00Z')).get('t1')!;
    expect(s.state).toBe('reserved');
    expect(s.reservation?.id).toBe('a');
    expect(s.upcoming.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('flags a confirmed booking that is late', () => {
    expect(computeTableStatuses([r({})], new Date('2026-10-20T18:15:00Z')).get('t1')!.state).toBe('attention');
  });

  it('prefers the seated party and counts later bookings', () => {
    const s = computeTableStatuses(
      [r({ id: 'later', arrivalAt: '2026-10-20T20:30:00.000Z', departureAt: '2026-10-20T22:00:00.000Z' }), r({ id: 'now', status: 'seated' })],
      new Date('2026-10-20T18:30:00Z'),
    ).get('t1')!;
    expect(s.state).toBe('seated');
    expect(s.reservation?.id).toBe('now');
    expect(s.upcoming.map((x) => x.id)).toEqual(['later']);
  });

  it('ignores cancelled and no-show reservations', () => {
    expect(computeTableStatuses([r({ status: 'cancelled' }), r({ id: 'x', status: 'no_show' })], new Date()).get('t1')).toBeUndefined();
  });

  it('shows pending online requests in their own colour', () => {
    expect(computeTableStatuses([r({ status: 'pending' })], new Date('2026-10-20T17:00:00Z')).get('t1')!.state).toBe('pending');
  });

  it('greys a table briefly after completion, then frees it', () => {
    const done = r({ status: 'completed', completedAt: '2026-10-20T19:00:00.000Z' });
    expect(computeTableStatuses([done], new Date('2026-10-20T19:05:00Z')).get('t1')!.state).toBe('completed');
    expect(computeTableStatuses([done], new Date('2026-10-20T19:30:00Z')).get('t1')!.state).toBe('free');
  });
});
