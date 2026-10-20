import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { AdminOverviewDto, AdminRestaurantDetail, AdminRestaurantRow } from '@hostly/shared';
import { createApp, login, resetDatabase, type Client } from './helpers';

/** Logs in to the admin panel (separate cookie, scoped to /api/admin). */
async function adminLogin(app: INestApplication, email = 'admin@hostly.local', password = 'secret123-admin') {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/admin/auth/login').send({ email, password }).expect(200);
  return {
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set('x-hostly', '1').send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set('x-hostly', '1').send(body ?? {}),
  };
}

describe('platform admin (e2e)', () => {
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof adminLogin>>;
  let staff: Client;
  let restaurantId: string;

  beforeAll(async () => {
    const seeded = await resetDatabase();
    restaurantId = seeded.restaurant.id;
    ({ app } = await createApp());
    admin = await adminLogin(app);
    staff = await login(app, 'owner@test.local');
  });
  afterAll(async () => {
    await app.close();
  });

  it('keeps admin and staff sessions apart', async () => {
    await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'admin@hostly.local', password: 'wrong' }).expect(401);
    await request(app.getHttpServer()).post('/api/admin/auth/login').send({ email: 'owner@test.local', password: 'secret123' }).expect(401);
    await staff.get('/api/admin/overview').expect(401);
    await admin.get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/admin/restaurants').expect(401);
  });

  it('reports platform metrics', async () => {
    const o: AdminOverviewDto = (await admin.get('/api/admin/overview').expect(200)).body;
    expect(o.restaurants.total).toBe(1);
    expect(o.staffUsers).toBe(3);
    expect(o.guests).toBe(20);
    expect(o.reservations.last30d).toBeGreaterThan(5);
    expect(o.perDay).toHaveLength(30);
    expect(o.system.dbOk).toBe(true);
  });

  it('lists restaurants with usage and shows details', async () => {
    const list: AdminRestaurantRow[] = (await admin.get('/api/admin/restaurants').expect(200)).body;
    expect(list[0]).toMatchObject({ slug: 'test', staff: 3, tables: 12, guests: 20, suspendedAt: null });
    const d: AdminRestaurantDetail = (await admin.get(`/api/admin/restaurants/${restaurantId}`).expect(200)).body;
    expect(d.users.map((u) => u.email).sort()).toEqual(['host1@test.local', 'host2@test.local', 'owner@test.local']);
    expect(Array.isArray(d.activity)).toBe(true);
  });

  it('never returns guest personal data', async () => {
    // Make sure there is an email in the log and fresh audit entries.
    await staff.post('/api/reservations', { arrivalAt: '2030-01-08T19:00', covers: 2, lastName: 'Privatović', email: 'privat.guest@example.com', force: true }).expect(201);
    const bodies = await Promise.all(
      ['/api/admin/overview', '/api/admin/restaurants', `/api/admin/restaurants/${restaurantId}`, '/api/admin/activity', '/api/admin/messages'].map(
        async (u) => JSON.stringify((await admin.get(u).expect(200)).body),
      ),
    );
    for (const b of bodies) {
      expect(b).not.toMatch(/Privatović|privat\.guest|Jovanović|Sanja|\+3816/);
      expect(b).not.toMatch(/"before"|"after"/);
    }
  });

  it('creates a restaurant whose owner can sign in', async () => {
    const r: AdminRestaurantDetail = (
      await admin
        .post('/api/admin/restaurants', { name: 'Bistro Novi', slug: 'bistro-novi', ownerName: 'Ana', ownerEmail: 'ana@bistro.local', ownerPassword: 'password123' })
        .expect(201)
    ).body;
    expect(r.users).toHaveLength(1);
    await login(app, 'ana@bistro.local', 'password123');
    await admin.post('/api/admin/restaurants', { name: 'X', slug: 'bistro-novi', ownerName: 'X', ownerEmail: 'x@x.local', ownerPassword: 'password123' }).expect(409);
    await admin.post('/api/admin/restaurants', { name: 'X', slug: 'Bad Slug!', ownerName: 'X', ownerEmail: 'y@x.local', ownerPassword: 'password123' }).expect(400);
  });

  it('suspends a restaurant: staff are cut off and the booking page closes', async () => {
    await admin.patch(`/api/admin/restaurants/${restaurantId}`, { suspended: true }).expect(200);
    await staff.get('/api/auth/me').expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'host1@test.local', password: 'secret123' }).expect(403);
    await request(app.getHttpServer()).get('/api/public/test').expect(404);

    await admin.patch(`/api/admin/restaurants/${restaurantId}`, { suspended: false }).expect(200);
    await request(app.getHttpServer()).get('/api/public/test').expect(200);
    staff = await login(app, 'owner@test.local');
    const d: AdminRestaurantDetail = (await admin.get(`/api/admin/restaurants/${restaurantId}`)).body;
    const adminActions = d.activity.filter((a) => a.action.startsWith('admin:')).map((a) => a.action);
    expect(adminActions.slice(0, 2)).toEqual(['admin:reactivate', 'admin:suspend']);
  });

  it('shares guests between restaurants and resets passwords', async () => {
    const list: AdminRestaurantRow[] = (await admin.get('/api/admin/restaurants')).body;
    const bistro = list.find((r) => r.slug === 'bistro-novi')!;
    const res = (await admin.post(`/api/admin/restaurants/${bistro.id}/share-guests`, { withRestaurantId: restaurantId }).expect(200)).body;
    expect(res.restaurant.sharesGuestsWith.map((r: { id: string }) => r.id)).toEqual([restaurantId]);

    const owner = res.restaurant.users[0];
    await admin.post(`/api/admin/users/${owner.id}/password`, { password: 'brand-new-pass' }).expect(204);
    await login(app, 'ana@bistro.local', 'brand-new-pass');
  });

  it('masks recipients in the email monitor', async () => {
    const r = (await staff.post('/api/reservations', { arrivalAt: '2030-01-09T19:00', covers: 2, lastName: 'Mail', email: 'masked.person@example.com', status: 'pending', source: 'online', force: true }).expect(201)).body;
    await staff.post(`/api/reservations/${r.id}/accept`, { tableIds: [] }).expect(200);
    await new Promise((res) => setTimeout(res, 200));
    const msgs = (await admin.get('/api/admin/messages').expect(200)).body as Array<{ recipient: string }>;
    expect(msgs.map((m) => m.recipient)).toContain('m***@example.com');
  });
});
