import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PublicRestaurantInfo, RestaurantDto } from '@hostly/shared';
import { createApp, login, resetDatabase, type Client } from './helpers';

// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

describe('booking page branding (e2e)', () => {
  let app: INestApplication;
  let owner: Client;
  let host: Client;
  const api = () => request(app.getHttpServer());
  const info = async () => (await api().get('/api/public/test').expect(200)).body as PublicRestaurantInfo;

  beforeAll(async () => {
    await resetDatabase();
    ({ app } = await createApp());
    owner = await login(app, 'owner@test.local');
    host = await login(app, 'host1@test.local');
  });
  afterAll(async () => {
    await app.close();
  });

  it('starts with the default look and no images', async () => {
    const r = await info();
    expect(r.branding).toEqual({ theme: { backgroundColor: null, accentColor: null, font: 'modern' }, images: { cover: null, logo: null } });
  });

  it('saves the theme with the online settings', async () => {
    const me: RestaurantDto = (await owner.get('/api/restaurant').expect(200)).body;
    const theme = { backgroundColor: '#f6f1e7', accentColor: '#9f1239', font: 'classic' };
    await owner.put('/api/restaurant/online', { ...me.onlineSettings, theme }).expect(200);
    expect((await info()).branding.theme).toEqual(theme);
    await owner.put('/api/restaurant/online', { ...me.onlineSettings, theme: { ...theme, accentColor: 'red' } }).expect(400);
  });

  it('lets only the owner upload images', async () => {
    await host.upload('/api/restaurant/images/cover', PNG, 'cover.png').expect(403);
  });

  it('serves an uploaded cover with a cacheable, versioned URL', async () => {
    const me: RestaurantDto = (await owner.upload('/api/restaurant/images/cover', PNG, 'cover.png').expect(200)).body;
    expect(me.images.cover).toMatch(/^\/api\/public\/test\/images\/cover\?v=\d+$/);
    expect((await info()).branding.images.cover).toBe(me.images.cover);
    const img = await api().get(me.images.cover!).buffer(true).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(img.body as Buffer, PNG)).toBe(0);
  });

  it('rejects files that are not JPEG, PNG or WebP, and unknown kinds', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await owner.upload('/api/restaurant/images/logo', svg, 'logo.png').expect(400);
    await owner.upload('/api/restaurant/images/banner', PNG, 'x.png').expect(400);
    expect((await info()).branding.images.logo).toBeNull();
  });

  it('removes an image', async () => {
    const before = (await info()).branding.images.cover!;
    const me: RestaurantDto = (await owner.delete('/api/restaurant/images/cover').expect(200)).body;
    expect(me.images.cover).toBeNull();
    await api().get(before).expect(404);
  });
});
