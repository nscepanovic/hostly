import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { ReservationDto, TableDto, TableSuggestion } from '@hostly/shared';
import { createApp, login, resetDatabase, type Client } from './helpers';

const TZ = 'Europe/Belgrade';
// A Wednesday two weeks out: open 09:00-16:00 and 16:00-01:00, nothing seeded on it.
const day = DateTime.now().setZone(TZ).plus({ weeks: 2 }).set({ weekday: 3 }).toISODate()!;
const at = (hhmm: string) => `${day}T${hhmm}`;

describe('reservations (e2e)', () => {
  let app: INestApplication;
  let host: Client;
  let owner: Client;
  let tables: TableDto[];
  const table = (label: string) => tables.find((t) => t.label === label)!;

  beforeAll(async () => {
    await resetDatabase();
    ({ app } = await createApp());
    host = await login(app, 'host1@test.local');
    owner = await login(app, 'owner@test.local');
    tables = (await host.get('/api/tables').expect(200)).body;
  });
  afterAll(async () => {
    await app.close();
  });

  describe('auth', () => {
    it('rejects anonymous requests and bad passwords', async () => {
      await request(app.getHttpServer()).get('/api/reservations?date=' + day).expect(401);
      await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'host1@test.local', password: 'nope' }).expect(401);
    });

    it('requires the CSRF header on writes', async () => {
      const agent = request.agent(app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: 'host1@test.local', password: 'secret123' }).expect(200);
      await agent.post('/api/tags').send({ kind: 'note', label: 'x' }).expect(403);
    });

    it('keeps floor plan editing and settings owner-only', async () => {
      const areaId = tables[0].areaId;
      await host.put('/api/floor-plan', { areaId, tables: [], deletedTableIds: [] }).expect(403);
      await host.put('/api/restaurant/online', {}).expect(403);
      await owner.put('/api/floor-plan', { areaId, tables: [], deletedTableIds: [] }).expect(200);
    });
  });

  describe('create', () => {
    it('suggests the smallest fitting table and links the customer by phone', async () => {
      const suggest = await host.get(`/api/reservations/suggest?arrivalAt=${at('19:00')}&covers=3`).expect(200);
      const best: TableSuggestion = suggest.body[0];
      expect(best.kind).toBe('single');
      expect(best.capacity.max).toBe(4);

      const res = await host
        .post('/api/reservations', { arrivalAt: at('19:00'), covers: 3, phone: '063 773 5033', tableIds: best.tableIds })
        .expect(201);
      const r: ReservationDto = res.body;
      expect(r.status).toBe('confirmed');
      expect(r.customerId).toBeTruthy();
      expect(r.lastName).toBe('Jovanović');
      expect(r.customerType).toBe('vip');
      expect(DateTime.fromISO(r.departureAt).diff(DateTime.fromISO(r.arrivalAt), 'minutes').minutes).toBe(120);
    });

    it('ranks higher-rated tables first for VIP guests', async () => {
      const vip = (await host.get('/api/customers/lookup?phone=0637735033').expect(200)).body;
      const regular = await host.get(`/api/reservations/suggest?arrivalAt=${at('12:00')}&covers=2`).expect(200);
      const forVip = await host.get(`/api/reservations/suggest?arrivalAt=${at('12:00')}&covers=2&customerId=${vip.id}`).expect(200);
      const rating = (s: TableSuggestion) => table(s.labels[0]).rating;
      expect(rating(forVip.body[0])).toBeGreaterThan(rating(regular.body[0]));
    });

    it('warns outside opening hours, and saves when forced', async () => {
      const res = await host.post('/api/reservations', { arrivalAt: at('07:00'), covers: 2, lastName: 'Early' }).expect(409);
      expect(res.body.issues.map((i: { code: string }) => i.code)).toContain('closed');
      await host.post('/api/reservations', { arrivalAt: at('07:00'), covers: 2, lastName: 'Early', force: true }).expect(201);
    });

    it('creates new customers from new phone numbers', async () => {
      const r = (await host.post('/api/reservations', { arrivalAt: at('13:00'), covers: 2, lastName: 'Novak', phone: '+385 91 234 5678' }).expect(201))
        .body as ReservationDto;
      const c = (await host.get(`/api/customers/${r.customerId}`).expect(200)).body;
      expect(c.phone).toBe('+385912345678');
    });
  });

  describe('double booking', () => {
    it('rejects an overlapping booking on the same table, even when forced', async () => {
      const t = table('br 12');
      await host.post('/api/reservations', { arrivalAt: at('20:00'), covers: 4, lastName: 'First', tableIds: [t.id] }).expect(201);
      const res = await host.post('/api/reservations', { arrivalAt: at('21:00'), covers: 4, lastName: 'Second', tableIds: [t.id], force: true }).expect(409);
      expect(res.body.code).toBe('table_conflict');
      // Back-to-back is fine: the first ends at 22:00.
      await host.post('/api/reservations', { arrivalAt: at('22:00'), covers: 4, lastName: 'Third', tableIds: [t.id] }).expect(201);
    });

    it('lets exactly one of several simultaneous requests win (DB exclusion constraint)', async () => {
      const t = table('br 11');
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          host.post('/api/reservations', { arrivalAt: at('18:00'), covers: 2, lastName: `Race${i}`, tableIds: [t.id], force: true }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    });

    it('frees the table when a reservation is cancelled', async () => {
      const t = table('br 9');
      const r = (await host.post('/api/reservations', { arrivalAt: at('14:00'), covers: 2, lastName: 'Gone', tableIds: [t.id] }).expect(201)).body;
      await host.post(`/api/reservations/${r.id}/status`, { status: 'cancelled' }).expect(200);
      await host.post('/api/reservations', { arrivalAt: at('14:00'), covers: 2, lastName: 'Next', tableIds: [t.id] }).expect(201);
      // Reopening the cancelled one now collides.
      await host.post(`/api/reservations/${r.id}/status`, { status: 'confirmed' }).expect(409);
    });

    it('rejects moving onto a busy table', async () => {
      const a = (await host.post('/api/reservations', { arrivalAt: at('10:00'), covers: 2, lastName: 'A', tableIds: [table('br 6').id] }).expect(201)).body;
      await host.post('/api/reservations', { arrivalAt: at('10:30'), covers: 2, lastName: 'B', tableIds: [table('br 7').id] }).expect(201);
      await host.post(`/api/reservations/${a.id}/move`, { tableIds: [table('br 7').id] }).expect(409);
    });
  });

  describe('duration and optional end', () => {
    const minutes = (r: ReservationDto) => DateTime.fromISO(r.departureAt).diff(DateTime.fromISO(r.arrivalAt), 'minutes').minutes;

    it('estimates the end from the party size when none is given, and keeps following it', async () => {
      const r: ReservationDto = (await host.post('/api/reservations', { arrivalAt: at('12:30'), covers: 2, lastName: 'Auto' }).expect(201)).body;
      expect(r.departureEstimated).toBe(true);
      expect(minutes(r)).toBe(90); // party of 2
      const bigger: ReservationDto = (await host.patch(`/api/reservations/${r.id}`, { covers: 6 }).expect(200)).body;
      expect(bigger.departureEstimated).toBe(true);
      expect(minutes(bigger)).toBe(150); // party of 5+
      const moved: ReservationDto = (await host.patch(`/api/reservations/${r.id}`, { arrivalAt: at('13:00') }).expect(200)).body;
      expect(DateTime.fromISO(moved.departureAt).setZone(TZ).toFormat('HH:mm')).toBe('15:30');
    });

    it('keeps an explicit end, also across midnight, and can go back to estimated', async () => {
      const next = DateTime.fromISO(day).plus({ days: 1 }).toISODate();
      const r: ReservationDto = (
        await host.post('/api/reservations', { arrivalAt: at('23:00'), departureAt: `${next}T01:30`, covers: 2, lastName: 'Late', force: true }).expect(201)
      ).body;
      expect(r.departureEstimated).toBe(false);
      expect(minutes(r)).toBe(150);
      expect(minutes((await host.patch(`/api/reservations/${r.id}`, { covers: 4 }).expect(200)).body)).toBe(150);
      const auto: ReservationDto = (await host.patch(`/api/reservations/${r.id}`, { departureAt: null }).expect(200)).body;
      expect(auto.departureEstimated).toBe(true);
      expect(minutes(auto)).toBe(120); // party of 4
    });

    it('rejects an end before the start or more than 24 hours later', async () => {
      await host.post('/api/reservations', { arrivalAt: at('19:00'), departureAt: at('18:00'), covers: 2, lastName: 'X' }).expect(400);
      const later = DateTime.fromISO(day).plus({ days: 2 }).toISODate();
      await host.post('/api/reservations', { arrivalAt: at('19:00'), departureAt: `${later}T19:00`, covers: 2, lastName: 'X', force: true }).expect(400);
    });

    it('lets one table hold several reservations in a day', async () => {
      const t = table('br 1');
      for (const [start, end] of [['09:00', '10:30'], ['11:00', '12:30'], ['17:00', '19:00'], ['19:00', '21:00']]) {
        await host.post('/api/reservations', { arrivalAt: at(start), departureAt: at(end), covers: 2, lastName: `Slot ${start}`, tableIds: [t.id], force: true }).expect(201);
      }
      await host.post('/api/reservations', { arrivalAt: at('18:30'), covers: 2, lastName: 'Clash', tableIds: [t.id], force: true }).expect(409);
    });
  });

  describe('status flow', () => {
    it('seats, completes and blocks invalid transitions', async () => {
      const r = (await host.post('/api/reservations', { arrivalAt: at('11:00'), covers: 2, lastName: 'Flow', tableIds: [table('br 4').id] }).expect(201)).body;
      await host.post(`/api/reservations/${r.id}/status`, { status: 'completed' }).expect(400);
      const seated = (await host.post(`/api/reservations/${r.id}/status`, { status: 'seated' }).expect(200)).body;
      expect(seated.seatedAt).toBeTruthy();
      const done = (await host.post(`/api/reservations/${r.id}/status`, { status: 'completed' }).expect(200)).body;
      expect(done.completedAt).toBeTruthy();
      const audit = (await host.get(`/api/reservations/${r.id}/audit`).expect(200)).body;
      expect(audit.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['create', 'status:seated', 'status:completed']));
    });

    it('patches only the fields that were sent', async () => {
      const r = (await host.post('/api/reservations', { arrivalAt: at('15:00'), covers: 2, lastName: 'Patch', notes: 'keep me', tags: ['birthday'] }).expect(201)).body;
      const p = (await host.patch(`/api/reservations/${r.id}`, { covers: 3 }).expect(200)).body;
      expect(p.covers).toBe(3);
      expect(p.notes).toBe('keep me');
      expect(p.tags).toEqual(['birthday']);
      expect(p.lastName).toBe('Patch');
    });
  });
});
