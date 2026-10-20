import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { CustomerDto, ReservationDto, RestaurantDto, TableDto } from '@hostly/shared';
import { env } from '../src/config/env';
import { createDb, type Db } from '../src/db/client';
import { createRestaurant, shareGuests, unshareGuests } from '../src/db/tenant';
import type { EmailAdapter } from '../src/messaging/email.adapter';
import { createApp, login, resetDatabase, type Client } from './helpers';

const day = DateTime.now().setZone('Europe/Belgrade').plus({ weeks: 2 }).set({ weekday: 5 }).toISODate()!;
const SANJA = '063 773 5033'; // a VIP guest of the seeded restaurant "test"

describe('multi-tenant isolation and guest sharing (e2e)', () => {
  let app: INestApplication;
  let email: EmailAdapter;
  let db: Db;
  let end: () => Promise<void>;
  let a: Client; // seeded restaurant "test"
  let b: Client; // second restaurant "other"
  let aId: string;
  let bId: string;
  let aTables: TableDto[];
  let bTables: TableDto[];

  beforeAll(async () => {
    const seeded = await resetDatabase();
    aId = seeded.restaurant.id;
    const conn = createDb(env().DATABASE_URL);
    db = conn.db;
    end = () => conn.pool.end();
    const other = await db.transaction((tx) =>
      createRestaurant(tx, {
        name: 'Other Place',
        slug: 'other',
        owner: { email: 'owner@other.local', name: 'Other Owner', password: 'secret123' },
        extra: { email: 'hello@other.example' },
      }),
    );
    bId = other.restaurant.id;
    ({ app, email } = await createApp());
    a = await login(app, 'owner@test.local');
    b = await login(app, 'owner@other.local');
    aTables = (await a.get('/api/tables')).body;
    // The new restaurant starts with an empty area: add two tables.
    const areaId = (await b.get('/api/areas')).body[0].id;
    const base = { areaId, shape: 'rect', w: 80, h: 80, rotation: 0, minSeats: 1, maxSeats: 4, rating: 5, active: true };
    bTables = (
      await b
        .put('/api/floor-plan', { areaId, tables: [{ ...base, label: 'T1', x: 0, y: 0 }, { ...base, label: 'T2', x: 200, y: 0 }], deletedTableIds: [] })
        .expect(200)
    ).body;
  });
  afterAll(async () => {
    await app.close();
    await end();
  });

  // A null JSON body arrives as {} in supertest.
  const sanjaIn = async (c: Client): Promise<CustomerDto | null> => {
    const body = (await c.get('/api/customers/lookup?phone=0637735033').expect(200)).body;
    return body?.id ? body : null;
  };

  describe('isolation', () => {
    it('keeps guests separate: same phone, two restaurants, two records', async () => {
      const aSanja = (await sanjaIn(a))!;
      expect(aSanja.type).toBe('vip');
      expect(await sanjaIn(b)).toBeNull();

      const r: ReservationDto = (
        await b.post('/api/reservations', { arrivalAt: `${day}T19:00`, covers: 2, phone: SANJA, lastName: 'Jovanović', tableIds: [bTables[0].id] }).expect(201)
      ).body;
      expect(r.customerId).not.toBe(aSanja.id);
      expect(r.customerType).toBe('regular');
      expect((await sanjaIn(b))!.id).toBe(r.customerId);
      expect((await sanjaIn(a))!.id).toBe(aSanja.id);
    });

    it('never reads or links another restaurant’s data by id', async () => {
      const aSanja = (await sanjaIn(a))!;
      await b.get(`/api/customers/${aSanja.id}`).expect(404);
      await b.get(`/api/customers/${aSanja.id}/visits`).expect(404);
      const aRes: ReservationDto[] = (await a.get(`/api/reservations?date=${DateTime.now().setZone('Europe/Belgrade').toISODate()}`)).body;
      await b.get(`/api/reservations/${aRes[0].id}`).expect(404);
      await b.post(`/api/reservations/${aRes[0].id}/status`, { status: 'cancelled' }).expect(404);

      // Passing a foreign customerId must not attach the other restaurant's guest.
      const r: ReservationDto = (
        await b.post('/api/reservations', { arrivalAt: `${day}T12:00`, covers: 2, lastName: 'X', customerId: aSanja.id }).expect(201)
      ).body;
      expect(r.customerId).toBeNull();

      await b.post('/api/reservations', { arrivalAt: `${day}T13:00`, covers: 2, lastName: 'X', tableIds: [aTables[0].id] }).expect(400);
      await b.post('/api/reservations', { arrivalAt: `${day}T13:00`, covers: 2, lastName: 'X', areaId: aTables[0].areaId }).expect(400);
      const list: CustomerDto[] = (await b.get('/api/customers?limit=200')).body.items;
      expect(list.every((c) => c.id !== aSanja.id)).toBe(true);
    });

    it('cuts off a deleted user immediately', async () => {
      const host = await login(app, 'host2@test.local');
      await host.get('/api/auth/me').expect(200);
      const users = (await a.get('/api/users')).body as Array<{ id: string; email: string }>;
      await a.delete(`/api/users/${users.find((u) => u.email === 'host2@test.local')!.id}`).expect(204);
      await host.get('/api/auth/me').expect(401);
    });
  });

  describe('sharing a guest database', () => {
    it('merges guests by phone and shows one history across both restaurants', async () => {
      const result = await db.transaction((tx) => shareGuests(tx, bId, aId));
      expect(result.merged).toBe(1); // Sanja existed in both

      const fromB = (await sanjaIn(b))!;
      const fromA = (await sanjaIn(a))!;
      expect(fromB.id).toBe(fromA.id);
      expect(fromB.type).toBe('vip');

      const visits = (await b.get(`/api/customers/${fromB.id}/visits`).expect(200)).body as Array<{ restaurant: string }>;
      expect(new Set(visits.map((v) => v.restaurant))).toEqual(new Set(['Restoran', 'Other Place']));

      const bInfo: RestaurantDto = (await b.get('/api/restaurant')).body;
      expect(bInfo.sharesGuestsWith.map((r) => r.slug)).toEqual(['test']);
    });

    it('links new reservations in either restaurant to the shared guest', async () => {
      const shared = (await sanjaIn(a))!;
      const r: ReservationDto = (
        await b.post('/api/reservations', { arrivalAt: `${day}T20:00`, covers: 2, phone: SANJA, tableIds: [bTables[1].id] }).expect(201)
      ).body;
      expect(r.customerId).toBe(shared.id);
      expect(r.customerType).toBe('vip');
    });

    it('gives a restaurant a private copy when it stops sharing', async () => {
      const shared = (await sanjaIn(a))!;
      const { copied } = await db.transaction((tx) => unshareGuests(tx, bId));
      expect(copied).toBeGreaterThan(0);
      const own = (await sanjaIn(b))!;
      expect(own.id).not.toBe(shared.id);
      expect(own.type).toBe('vip');
      expect((await sanjaIn(a))!.id).toBe(shared.id);
      expect(((await b.get('/api/restaurant')).body as RestaurantDto).sharesGuestsWith).toEqual([]);
      const ownVisits = (await b.get(`/api/customers/${own.id}/visits`)).body as Array<{ restaurant: string }>;
      expect(ownVisits.every((v) => v.restaurant === 'Other Place')).toBe(true);
    });
  });

  it('sends guest emails as the restaurant, with replies going to the restaurant', async () => {
    const before = email.outbox.length;
    const r: ReservationDto = (
      await b.post('/api/reservations', { arrivalAt: `${day}T21:00`, covers: 2, lastName: 'Mail', email: 'guest@example.com', status: 'pending', source: 'online' }).expect(201)
    ).body;
    await b.post(`/api/reservations/${r.id}/accept`, { tableIds: [] }).expect(200);
    await new Promise((res) => setTimeout(res, 200));
    const mail = email.outbox.slice(before).find((m) => m.to === 'guest@example.com')!;
    expect(mail.fromName).toBe('Other Place');
    expect(mail.replyTo).toBe('hello@other.example');
  });
});
