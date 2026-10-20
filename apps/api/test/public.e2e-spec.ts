import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import request from 'supertest';
import type { PublicSlot, ReservationDto, TableDto } from '@hostly/shared';
import type { EmailAdapter } from '../src/messaging/email.adapter';
import { createApp, login, resetDatabase, type Client } from './helpers';

const TZ = 'Europe/Belgrade';
const day = DateTime.now().setZone(TZ).plus({ weeks: 3 }).set({ weekday: 4 }).toISODate()!;

describe('public booking widget (e2e)', () => {
  let app: INestApplication;
  let email: EmailAdapter;
  let host: Client;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    await resetDatabase();
    ({ app, email } = await createApp());
    host = await login(app, 'host1@test.local');
  });
  afterAll(async () => {
    await app.close();
  });

  const book = (body: Partial<Record<string, unknown>> = {}) =>
    api()
      .post('/api/public/test/book')
      .send({ date: day, time: '19:00', covers: 2, firstName: 'Anna', lastName: 'Berg', phone: '+46 70 123 45 67', email: 'anna@example.com', language: 'en', ...body });

  it('lists only slots with capacity', async () => {
    const slots: PublicSlot[] = (await api().get(`/api/public/test/availability?date=${day}&covers=2`).expect(200)).body;
    expect(slots.length).toBeGreaterThan(20);
    expect(slots.find((s) => s.time === '19:00')?.available).toBe(true);
    // Above the online max party size nothing is bookable.
    const big: PublicSlot[] = (await api().get(`/api/public/test/availability?date=${day}&covers=12`).expect(200)).body;
    expect(big.every((s) => !s.available)).toBe(true);
  });

  it('creates a pending request with a held table, a priority item and an email in the guest language', async () => {
    const before = email.outbox.length;
    await book().expect(201);
    const priority: ReservationDto[] = (await host.get('/api/reservations/priority').expect(200)).body;
    const r = priority.find((p) => p.lastName === 'Berg')!;
    expect(r.status).toBe('pending');
    expect(r.source).toBe('online');
    expect(r.language).toBe('en');
    expect(r.tableIds).toHaveLength(1);
    await new Promise((res) => setTimeout(res, 200));
    const mail = email.outbox.slice(before).find((m) => m.to === 'anna@example.com')!;
    expect(mail.subject).toMatch(/We received your request/);
    expect(mail.text).toMatch(/\/r\/[\w-]+\?action=cancel/);
  });

  it('sends the confirmation in the reservation language when the host accepts', async () => {
    const r = ((await host.get('/api/reservations/priority')).body as ReservationDto[]).find((p) => p.lastName === 'Berg')!;
    const before = email.outbox.length;
    await host.post(`/api/reservations/${r.id}/accept`, { tableIds: r.tableIds }).expect(200);
    await new Promise((res) => setTimeout(res, 200));
    expect(email.outbox.slice(before).map((m) => m.subject)).toEqual([expect.stringMatching(/^Reservation confirmed/)]);
  });

  it('lets the guest cancel with the emailed token', async () => {
    const link = email.outbox.find((m) => m.to === 'anna@example.com' && /confirmed/.test(m.subject))!.text.match(/\/r\/([\w-]+)\?/)![1];
    expect((await api().get(`/api/public/r/${link}`).expect(200)).body.status).toBe('confirmed');
    expect((await api().post(`/api/public/r/${link}/cancel`).expect(200)).body.status).toBe('cancelled');
    await api().get('/api/public/r/not-a-token').expect(404);
  });

  it('closes a slot once every fitting table is taken', async () => {
    const tables: TableDto[] = (await host.get('/api/tables')).body;
    for (const t of tables.filter((x) => x.active)) {
      await host.post('/api/reservations', { arrivalAt: `${day}T13:00`, covers: t.minSeats, lastName: `Fill ${t.label}`, tableIds: [t.id], force: true }).expect(201);
    }
    const slots: PublicSlot[] = (await api().get(`/api/public/test/availability?date=${day}&covers=2`).expect(200)).body;
    expect(slots.find((s) => s.time === '13:00')?.available).toBe(false);
    await book({ time: '13:00' }).expect(409);
  });

  it('silently drops honeypot submissions', async () => {
    const before = ((await host.get('/api/reservations/priority')).body as ReservationDto[]).length;
    const res = await book({ time: '20:00', lastName: 'Bot', website: 'http://spam.example' }).expect(201);
    expect(res.body.status).toBe('pending');
    const after = ((await host.get('/api/reservations/priority')).body as ReservationDto[]).length;
    expect(after).toBe(before);
  });
});
