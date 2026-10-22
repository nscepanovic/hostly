import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { PushStatusDto } from '@hostly/shared';
import type { EmailAdapter } from '../src/messaging/email.adapter';
import { PushService } from '../src/push/push.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { createApp, login, resetDatabase, type Client } from './helpers';

const day = DateTime.now().setZone('Europe/Belgrade').plus({ weeks: 3 }).set({ weekday: 3 }).toISODate()!;
const tick = () => new Promise((r) => setTimeout(r, 300));

const sub = (n: number, events = ['new_request', 'table_free', 'guest_cancelled'], language = 'sr') => ({
  endpoint: `https://push.example.test/send/${n}`,
  keys: { p256dh: 'BKey', auth: 'auth' },
  deviceId: `device-000${n}`,
  language,
  events,
});

describe('push notifications (e2e)', () => {
  let app: INestApplication;
  let email: EmailAdapter;
  let host: Client;
  let owner: Client;
  let push: PushService;
  let sent: Array<{ endpoint: string; payload: { title: string; body: string; url: string; tag: string } }>;
  const api = () => request(app.getHttpServer());
  const book = (time: string, lastName: string) =>
    api()
      .post('/api/public/test/book')
      .send({ date: day, time, covers: 2, firstName: 'Mila', lastName, phone: '+381 64 111 2233', email: `guest.${time.replace(":", "")}@example.com`, language: 'sr' })
      .expect(201);

  beforeAll(async () => {
    await resetDatabase();
    ({ app, email } = await createApp());
    host = await login(app, 'host1@test.local');
    owner = await login(app, 'owner@test.local');
    push = app.get(PushService);
  });
  beforeEach(() => {
    sent = [];
    push.sender = async (s, payload) => {
      sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
    };
  });
  afterAll(async () => {
    await app.close();
  });

  it('subscribes a device and reports its status', async () => {
    const before: PushStatusDto = (await host.get('/api/push?deviceId=device-0001').expect(200)).body;
    expect(before.publicKey).toMatch(/^B/);
    expect(before.subscription).toBeNull();
    const after: PushStatusDto = (await host.put('/api/push/subscription', sub(1)).expect(200)).body;
    expect(after.subscription).toEqual({ endpoint: sub(1).endpoint, events: sub(1).events });
  });

  it('pushes a new online request to subscribed devices, in their language', async () => {
    await owner.put('/api/push/subscription', sub(2, ['new_request'], 'en')).expect(200);
    await book('18:00', 'Pushić');
    await tick();
    expect(sent).toHaveLength(2);
    const sr = sent.find((s) => s.endpoint.endsWith('/1'))!.payload;
    expect(sr.title).toBe('Novi zahtev za rezervaciju');
    expect(sr.body).toContain('Pushić Mila · 2 os.');
    expect(sr.url).toMatch(/^\/\?reservation=[0-9a-f-]{36}&panel=priority$/);
    expect(sent.find((s) => s.endpoint.endsWith('/2'))!.payload.title).toBe('New reservation request');
  });

  it('skips devices that have Hostly on screen', async () => {
    const spy = jest.spyOn(app.get(RealtimeGateway), 'visibleDevices').mockReturnValue(new Set(['device-0001']));
    await book('18:30', 'Visible');
    await tick();
    spy.mockRestore();
    expect(sent.map((s) => s.endpoint)).toEqual([sub(2).endpoint]);
  });

  it('respects the events a device chose', async () => {
    await owner.put('/api/push/subscription', sub(2, ['table_free'], 'en')).expect(200);
    await book('19:00', 'Filtered');
    await tick();
    expect(sent.map((s) => s.endpoint)).toEqual([sub(1).endpoint]);
  });

  it('notifies when a guest cancels from the email link', async () => {
    const before = email.outbox.length;
    await book('19:30', 'Otkazić');
    await tick();
    const link = email.outbox.slice(before).map((m) => m.text.match(/\/r\/([\w-]+)/)?.[1]).find(Boolean)!;
    sent = [];
    await api().post(`/api/public/r/${link}/cancel`).expect(200);
    await tick();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ title: 'Gost je otkazao rezervaciju', tag: expect.stringMatching(/^cancel-/) });
    expect(sent[0].payload.body).toContain('Otkazić Mila');
  });

  it('drops subscriptions the push service reports as gone', async () => {
    push.sender = async () => {
      throw Object.assign(new Error('Gone'), { statusCode: 410 });
    };
    await book('20:00', 'Gone');
    await tick();
    expect((await host.get('/api/push?deviceId=device-0001').expect(200)).body.subscription).toBeNull();
  });

  it('keeps one subscription per device and lets users unsubscribe', async () => {
    await host.put('/api/push/subscription', sub(3)).expect(200);
    await host.put('/api/push/subscription', { ...sub(4), deviceId: sub(3).deviceId }).expect(200);
    const status: PushStatusDto = (await host.get(`/api/push?deviceId=${sub(3).deviceId}`).expect(200)).body;
    expect(status.subscription?.endpoint).toBe(sub(4).endpoint);
    expect((await host.post('/api/push/test', { deviceId: sub(3).deviceId }).expect(200)).body).toEqual({ sent: 1 });
    expect(sent[0].payload.title).toBe('Hostly obaveštenja rade');
    await host.delete(`/api/push/subscription?endpoint=${encodeURIComponent(sub(4).endpoint)}`).expect(204);
    expect((await host.get(`/api/push?deviceId=${sub(3).deviceId}`).expect(200)).body.subscription).toBeNull();
  });

  it('rejects invalid subscriptions', async () => {
    await host.put('/api/push/subscription', { ...sub(5), endpoint: 'not a url' }).expect(400);
    await host.put('/api/push/subscription', { ...sub(5), events: ['everything'] }).expect(400);
  });
});
