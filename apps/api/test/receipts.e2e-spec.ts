import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { AnalyticsDto, CustomerInsights, ReceiptDto, ReservationDto } from '@hostly/shared';
import { ReceiptsService } from '../src/receipts/receipts.service';
import { createApp, login, resetDatabase, type Client } from './helpers';
import { fakeSuf, receiptLink } from './receipt-fixtures';

const TZ = 'Europe/Belgrade';
const day = DateTime.now().setZone(TZ).minus({ days: 10 }).startOf('day');
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return day.set({ hour: h, minute: m });
};

const lunch = receiptLink({ counter: 101, amount: 1260, at: at('13:05').toJSDate() });
const dinner = receiptLink({ counter: 102, amount: 4200, at: at('20:40').toJSDate() });
const refund = receiptLink({ counter: 103, amount: 360, at: at('20:55').toJSDate(), refund: true });
const copy = receiptLink({ counter: 104, amount: 100, at: at('21:00').toJSDate(), type: 2 });
const offline = receiptLink({ counter: 105, amount: 900, at: at('21:10').toJSDate() });

describe('receipts and analytics (e2e)', () => {
  let app: INestApplication;
  let host: Client;
  let owner: Client;
  let service: ReceiptsService;
  let lunchRes: ReservationDto;
  let dinnerRes: ReservationDto;
  const suf = fakeSuf({
    [lunch.invoiceNumber]: [
      { name: 'Espresso', quantity: 2, unitPrice: 180 },
      { name: 'Ćevapi', quantity: 1, unitPrice: 900 },
    ],
    [dinner.invoiceNumber]: [
      { name: 'Espresso', quantity: 1, unitPrice: 180 },
      { name: 'Rib eye', quantity: 1, unitPrice: 3300 },
      { name: 'Vino belo', quantity: 2, unitPrice: 360 },
    ],
    [refund.invoiceNumber]: [{ name: 'Vino belo', quantity: 1, unitPrice: 360 }],
    [offline.invoiceNumber]: [{ name: 'Pivo', quantity: 3, unitPrice: 300 }],
  });

  beforeAll(async () => {
    await resetDatabase();
    ({ app } = await createApp());
    host = await login(app, 'host1@test.local');
    owner = await login(app, 'owner@test.local');
    service = app.get(ReceiptsService);
    service.fetcher = suf.fetcher;
    const guest = { firstName: 'Mila', lastName: 'Receiptić', phone: '064 777 1212' };
    lunchRes = (await host.post('/api/reservations', { arrivalAt: at('12:30').toISO(), covers: 2, ...guest, force: true }).expect(201)).body;
    dinnerRes = (await host.post('/api/reservations', { arrivalAt: at('19:30').toISO(), covers: 3, ...guest, force: true }).expect(201)).body;
    for (const r of [lunchRes, dinnerRes]) {
      await host.post(`/api/reservations/${r.id}/status`, { status: 'seated' }).expect(200);
      await host.post(`/api/reservations/${r.id}/status`, { status: 'completed' }).expect(200);
    }
  });
  afterAll(async () => {
    await app.close();
  });

  it('scans a receipt for a reservation: header from the QR, items and payments from the tax site', async () => {
    const r: ReceiptDto = (await host.post('/api/receipts', { url: lunch.url, reservationId: lunchRes.id }).expect(201)).body;
    expect(r).toMatchObject({ invoiceNumber: lunch.invoiceNumber, total: 1260, transactionType: 'sale', status: 'ready', sellerTin: '100000001', reservationId: lunchRes.id });
    expect(r.items).toEqual([
      { name: 'Espresso', unit: 'kom', quantity: 2, unitPrice: 180, total: 360, vatLabel: 'Ђ' },
      { name: 'Ćevapi', unit: 'kom', quantity: 1, unitPrice: 900, total: 900, vatLabel: 'Ђ' },
    ]);
    expect(r.payments).toEqual([{ method: 'card', amount: 1260 }]);
    expect(r.guestName).toBe('Receiptić Mila');
    const res: ReservationDto = (await host.get(`/api/reservations/${lunchRes.id}`).expect(200)).body;
    expect(res.spend).toBe(1260);
  });

  it('refuses the same receipt twice and returns the existing one', async () => {
    const res = await host.post('/api/receipts', { url: lunch.url }).expect(409);
    expect(res.body.code).toBe('duplicate');
    expect(res.body.receipt.reservationId).toBe(lunchRes.id);
  });

  it('refuses copies and links that are not Serbian fiscal receipts', async () => {
    expect((await host.post('/api/receipts', { url: copy.url }).expect(400)).body.code).toBe('not_original');
    expect((await host.post('/api/receipts', { url: 'https://example.com/v/?vl=A1ZRTlhG' }).expect(400)).body.code).toBe('invalid_receipt');
  });

  it('stores refunds as negative amounts', async () => {
    await host.post('/api/receipts', { url: dinner.url, reservationId: dinnerRes.id }).expect(201);
    const r: ReceiptDto = (await host.post('/api/receipts', { url: refund.url, reservationId: dinnerRes.id }).expect(201)).body;
    expect(r.total).toBe(-360);
    expect(r.items[0]).toMatchObject({ name: 'Vino belo', quantity: -1, total: -360 });
    const res: ReservationDto = (await host.get(`/api/reservations/${dinnerRes.id}`).expect(200)).body;
    expect(res.spend).toBe(4200 - 360);
  });

  it('keeps the receipt when the tax site is down and fetches the items on retry', async () => {
    service.fetcher = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as typeof fetch;
    const r: ReceiptDto = (await host.post('/api/receipts', { url: offline.url }).expect(201)).body;
    expect(r).toMatchObject({ status: 'failed', total: 900, items: [], reservationId: null });
    expect(r.error).toContain('ECONNREFUSED');
    service.fetcher = suf.fetcher;
    const again: ReceiptDto = (await host.post(`/api/receipts/${r.id}/retry`).expect(200)).body;
    expect(again.status).toBe('ready');
    const unassigned: ReceiptDto[] = (await host.get('/api/receipts?unassigned=1').expect(200)).body;
    expect(unassigned.map((x) => x.id)).toEqual([r.id]);
  });

  it('links an unassigned receipt to a guest later, and unlinks it', async () => {
    const [r]: ReceiptDto[] = (await host.get('/api/receipts?unassigned=1').expect(200)).body;
    await host.patch(`/api/receipts/${r.id}`, { reservationId: lunchRes.id }).expect(200);
    expect((await host.get(`/api/reservations/${lunchRes.id}`).expect(200)).body.spend).toBe(1260 + 900);
    const list: ReceiptDto[] = (await host.get(`/api/receipts?reservationId=${lunchRes.id}`).expect(200)).body;
    expect(list).toHaveLength(2);
    await host.patch(`/api/receipts/${r.id}`, { reservationId: null }).expect(200);
    expect((await host.get(`/api/reservations/${lunchRes.id}`).expect(200)).body.spend).toBe(1260);
  });

  it('shows what the guest likes and spends', async () => {
    const res: ReservationDto = (await host.get(`/api/reservations/${lunchRes.id}`).expect(200)).body;
    const insights: CustomerInsights = (await host.get(`/api/analytics/customers/${res.customerId}`).expect(200)).body;
    expect(insights).toMatchObject({ receipts: 3, totalSpent: 1260 + 4200 - 360, averagePerVisit: (1260 + 4200 - 360) / 2, averagePerCover: (1260 + 4200 - 360) / 5 });
    expect(insights.favoriteItems[0]).toMatchObject({ name: 'Espresso', quantity: 3, times: 2 });
    expect(insights.favoriteItems.find((i) => i.name === 'Vino belo')).toMatchObject({ quantity: 1, times: 2, total: 360 });
    expect(insights.lastReceipt?.invoiceNumber).toBe(refund.invoiceNumber);
  });

  it('reports revenue, best sellers and what sells at lunch vs dinner (owner only)', async () => {
    const q = `from=${day.minus({ days: 1 }).toISODate()}&to=${day.plus({ days: 1 }).toISODate()}`;
    await host.get(`/api/analytics?${q}`).expect(403);
    const a: AnalyticsDto = (await owner.get(`/api/analytics?${q}`).expect(200)).body;
    const net = 1260 + 4200 - 360 + 900;
    expect(a).toMatchObject({ revenue: net, receipts: 3, averageReceipt: net / 3, completedWithReceipt: 2, coversWithReceipt: 5 });
    // The seed has other completed (unscanned) reservations around that day.
    expect(a.completedReservations).toBeGreaterThan(2);
    expect(a.revenuePerCover).toBe((1260 + 4200 - 360) / 5);
    expect(a.byDay).toHaveLength(3);
    expect(a.byDay[1]).toEqual({ date: day.toISODate(), revenue: net, receipts: 3 });
    expect(a.byHour.map((h) => h.hour)).toEqual([13, 20, 21]);
    expect(a.topItems[0]).toMatchObject({ name: 'Rib eye', revenue: 3300 });
    expect(a.topItems.find((i) => i.name === 'Espresso')).toMatchObject({ quantity: 3, revenue: 540, receipts: 2 });
    const byShift = Object.fromEntries(a.itemsByShift.map((s) => [s.shift, s.items.map((i) => i.name)]));
    expect(byShift.lunch).toEqual(['Ćevapi', 'Espresso']);
    expect(byShift.dinner?.[0]).toBe('Rib eye');
    expect(a.payments).toEqual([{ method: 'card', amount: net }]);
  });

  it('lets only the owner delete a receipt', async () => {
    const [r]: ReceiptDto[] = (await host.get('/api/receipts?unassigned=1').expect(200)).body;
    await host.delete(`/api/receipts/${r.id}`).expect(403);
    await owner.delete(`/api/receipts/${r.id}`).expect(204);
    await host.get(`/api/receipts/${r.id}`).expect(404);
  });
});
