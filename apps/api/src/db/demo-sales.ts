import type { DateTime } from 'luxon';
import type { PaymentMethod } from '@hostly/shared';
import type { DbOrTx } from './client';
import * as s from './schema';

/** A typical Serbian restaurant menu (RSD). `lunch` items sell mostly at lunch. */
const MENU: Array<{ name: string; price: number; drink?: boolean; lunch?: boolean }> = [
  { name: 'Ćevapi 10 kom', price: 1150, lunch: true },
  { name: 'Pljeskavica', price: 1050, lunch: true },
  { name: 'Pasulj prebranac', price: 650, lunch: true },
  { name: 'Riblja čorba', price: 690, lunch: true },
  { name: 'Karađorđeva šnicla', price: 1450 },
  { name: 'Rib eye steak', price: 3300 },
  { name: 'Pastrmka na žaru', price: 1490 },
  { name: 'Šopska salata', price: 590 },
  { name: 'Palačinke', price: 420 },
  { name: 'Espresso', price: 220, drink: true, lunch: true },
  { name: 'Kafa sa mlekom', price: 260, drink: true, lunch: true },
  { name: 'Limunada', price: 350, drink: true, lunch: true },
  { name: 'Kisela voda 0,33', price: 250, drink: true },
  { name: 'Pivo Jelen 0,5', price: 380, drink: true },
  { name: 'Čaša belog vina', price: 450, drink: true },
  { name: 'Rakija šljiva', price: 350, drink: true },
];

/** Deterministic pseudo-random numbers, so every reseed shows the same demo data. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Demo-only receipt link: real QR header layout, but not registered with the tax office. */
function demoLink(counter: number, amount: number, at: Date) {
  const b = Buffer.alloc(44);
  let o = 0;
  b[o++] = 3;
  o += b.write('DEMO0001', o, 'latin1');
  o += b.write('DEMO0001', o, 'latin1');
  o = b.writeUInt32LE(counter, o);
  o = b.writeUInt32LE(counter, o);
  o = b.writeBigUInt64LE(BigInt(Math.round(amount * 10000)), o);
  b.writeBigUInt64BE(BigInt(at.getTime()), o);
  return `https://suf.purs.gov.rs/v/?vl=${encodeURIComponent(b.toString('base64'))}`;
}

/**
 * About a month of lunch and dinner receipts (walk-ins), plus receipts for the
 * given past visits, so analytics and guest insights have data in development.
 */
export async function seedDemoSales(tx: DbOrTx, restaurantId: string, today: DateTime, visits: Array<{ id: string; at: DateTime; covers: number }>) {
  const rand = rng(42);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  let counter = 1000;
  const make = async (at: DateTime, covers: number, reservationId: string | null) => {
    const lunch = at.hour < 16;
    // Lunch is mostly grill and cooked dishes; dinner is everything.
    const food = MENU.filter((m) => !m.drink && (lunch ? m.lunch || rand() < 0.25 : !m.lunch || rand() < 0.3));
    const drinks = MENU.filter((m) => m.drink && (lunch ? m.lunch || rand() < 0.2 : true));
    const lines = new Map<string, { price: number; qty: number }>();
    for (let g = 0; g < covers; g++) {
      for (const m of [pick(food), pick(drinks), ...(rand() < 0.4 ? [pick(drinks)] : [])]) {
        const line = lines.get(m.name) ?? { price: m.price, qty: 0 };
        line.qty += 1;
        lines.set(m.name, line);
      }
    }
    const total = [...lines.values()].reduce((n, l) => n + l.price * l.qty, 0);
    const method: PaymentMethod = rand() < 0.7 ? 'card' : 'cash';
    counter += 1;
    const [receipt] = await tx
      .insert(s.receipts)
      .values({
        restaurantId,
        reservationId,
        invoiceNumber: `DEMO0001-DEMO0001-${counter}`,
        verificationUrl: demoLink(counter, total, at.toJSDate()),
        issuedAt: at.toJSDate(),
        total,
        transactionType: 'sale',
        sellerTin: '100000001',
        sellerName: 'DEMO',
        payments: [{ method, amount: total }],
        status: 'ready',
        fetchedAt: at.toJSDate(),
      })
      .returning({ id: s.receipts.id });
    await tx.insert(s.receiptItems).values(
      [...lines.entries()].map(([name, l], position) => ({
        receiptId: receipt.id,
        restaurantId,
        position,
        name,
        unit: 'kom',
        quantity: l.qty,
        unitPrice: l.price,
        total: l.price * l.qty,
        vatLabel: 'Ђ',
        vatRate: 20,
      })),
    );
    return total;
  };

  for (let d = 30; d >= 1; d--) {
    const day = today.minus({ days: d }).startOf('day');
    const busy = day.weekday >= 5 ? 1.6 : 1;
    const lunches = Math.round((2 + rand() * 4) * busy);
    const dinners = Math.round((4 + rand() * 6) * busy);
    for (let i = 0; i < lunches; i++) await make(day.set({ hour: 12 + Math.floor(rand() * 3), minute: Math.floor(rand() * 60) }), 1 + Math.floor(rand() * 3), null);
    for (let i = 0; i < dinners; i++) await make(day.set({ hour: 18 + Math.floor(rand() * 4), minute: Math.floor(rand() * 60) }), 2 + Math.floor(rand() * 4), null);
  }
  const spend = new Map<string, number>();
  for (const v of visits) spend.set(v.id, await make(v.at.plus({ hours: 2 }), v.covers, v.id));
  return spend;
}
