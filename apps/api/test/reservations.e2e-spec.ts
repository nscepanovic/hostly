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
