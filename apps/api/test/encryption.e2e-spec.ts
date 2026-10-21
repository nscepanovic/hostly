import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Pool } from 'pg';
import { env } from '../src/config/env';
import { createApp, login, resetDatabase, type Client } from './helpers';

const day = DateTime.now().setZone('Europe/Belgrade').plus({ weeks: 2 }).set({ weekday: 2 }).toISODate()!;
const GUEST = { firstName: 'Zoltan', lastName: 'Kovačević-Zzyzx', phone: '+381 65 123 9876', email: 'zoltan.zzyzx@example.org' };

describe('personal data encryption (e2e)', () => {
  let app: INestApplication;
  let host: Client;
  let pool: Pool;

  beforeAll(async () => {
    await resetDatabase();
    ({ app } = await createApp());
    host = await login(app, 'owner@test.local');
    pool = new Pool({ connectionString: env().DATABASE_URL });
    await host
      .post('/api/reservations', { arrivalAt: `${day}T19:00`, covers: 2, ...GUEST, notes: 'Allergic to Zzyzx nuts', status: 'pending', source: 'online' })
      .expect(201);
    await host.post('/api/waiting', { guestName: 'Zzyzx Walkin', phone: '064 000 1111', covers: 2 }).expect(201);
    await host.post('/api/users', { name: 'Zzyzx Host', email: 'zzyzx.host@test.local', password: 'password123', role: 'host' }).expect(201);
    const pending = (await host.get('/api/reservations/priority')).body as Array<{ id: string; lastName: string }>;
    await host.post(`/api/reservations/${pending.find((r) => r.lastName === GUEST.lastName)!.id}/accept`, { tableIds: [] }).expect(200);
    await new Promise((r) => setTimeout(r, 200));
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  it('stores no plaintext personal data in any table', async () => {
    const needles = ['zzyzx', 'zoltan', '1239876', '123 9876'];
    const tables = ['customers', 'reservations', 'waiting_entries', 'users', 'messages', 'audit_log'];
    for (const table of tables) {
      const { rows } = await pool.query(`select * from "${table}"`);
      expect(rows.length).toBeGreaterThan(0);
      const dump = JSON.stringify(rows).toLowerCase();
      for (const n of needles) expect({ table, leaked: dump.includes(n) ? n : null }).toEqual({ table, leaked: null });
    }
  });

  it('still returns decrypted data through the API', async () => {
    const res = await host.get('/api/customers/lookup?phone=065%20123%209876').expect(200);
    expect(res.body).toMatchObject({ firstName: 'Zoltan', lastName: GUEST.lastName, email: GUEST.email, phone: '+381651239876' });
  });

  it.each(['zoltan', 'kovacevic', 'Kovačević-Zzy', 'zzyzx', 'zoltan.zzyzx@example.org', 'zoltan.zz', '065 123', '+381 65 123 98', '9876'])(
    'finds the guest by "%s"',
    async (q) => {
      const res = await host.get(`/api/customers?search=${encodeURIComponent(q)}`).expect(200);
      expect(res.body.items.map((c: { lastName: string }) => c.lastName)).toContain(GUEST.lastName);
    },
  );

  const suggest = (field: string, q: string) => host.get(`/api/customers/suggest?field=${field}&q=${encodeURIComponent(q)}`).expect(200);

  it.each([
    ['name', 'Ko'],
    ['name', 'kovač zol'],
    ['phone', '065 12'],
    ['phone', '+381 65'],
    ['phone', '9876'],
    ['email', 'zol'],
    ['email', 'zoltan.zzyzx@ex'],
  ])('suggests the guest while typing %s "%s"', async (field, q) => {
    const res = await suggest(field, q);
    expect(res.body.map((c: { lastName: string }) => c.lastName)).toContain(GUEST.lastName);
    expect(res.body.length).toBeLessThanOrEqual(8);
  });

  it.each([
    ['name', 'Z'],
    ['name', 'example'], // the email domain does not match the name field
    ['phone', '06'],
    ['email', 'kovacevic'], // name does not match the email field
    ['name', 'Kovačević Petar'],
  ])('does not suggest for %s "%s"', async (field, q) => {
    const res = await suggest(field, q);
    expect(res.body.map((c: { lastName: string }) => c.lastName)).not.toContain(GUEST.lastName);
  });

  it('logs in with the encrypted email, case-insensitively', async () => {
    await login(app, 'ZZYZX.Host@test.local', 'password123');
  });
});
