import { BadRequestException, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AnalyticsDto, CustomerInsights, PaymentMethod } from '@hostly/shared';
import { businessDayStart, shiftAt } from '../common/time';
import { InjectDb, type Db } from '../db/db.module';
import type { RestaurantRow } from '../db/schema';
import { RestaurantService } from '../restaurant/restaurant.service';
import { ReceiptsService } from './receipts.service';

const MAX_RANGE_DAYS = 366;
/** Receipts printed outside every shift (e.g. after closing). */
export const OUTSIDE_SHIFTS = 'other';

const num = (v: unknown) => Number(v ?? 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Sales analytics from scanned receipts. Days are business days (the day
 * starts at the restaurant's dayStart) in the restaurant's timezone; refunds
 * are stored negative, so every sum is net.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly restaurants: RestaurantService,
    private readonly receipts: ReceiptsService,
  ) {}

  async summary(restaurantId: string, from: string, to: string): Promise<AnalyticsDto> {
    const r = await this.restaurants.get(restaurantId);
    const start = businessDayStart(r, from);
    const end = businessDayStart(r, to).plus({ days: 1 });
    const days = end.diff(start, 'days').days;
    if (days < 1 || days > MAX_RANGE_DAYS) throw new BadRequestException(`Pick a range of 1 to ${MAX_RANGE_DAYS} days`);

    const tz = r.timezone;
    const range = sql`r.restaurant_id = ${restaurantId} and r.issued_at >= ${start.toJSDate()} and r.issued_at < ${end.toJSDate()}`;
    const local = sql`(r.issued_at at time zone ${tz})`;
    const businessDate = sql`(${local} - ${`${r.dayStart}:00`}::interval)::date`;

    const [totals, coverage, byDay, byHour, byWeekday, topItems, itemRows, payments] = await Promise.all([
      this.db.execute<{ revenue: string; sales: number; assigned_revenue: string; covers: string }>(sql`
        select coalesce(sum(r.total), 0) as revenue,
               count(*) filter (where r.transaction_type = 'sale')::int as sales,
               coalesce(sum(r.total) filter (where r.reservation_id is not null), 0) as assigned_revenue,
               (select coalesce(sum(res.covers), 0) from reservations res
                 where exists (select 1 from receipts r where ${range} and r.reservation_id = res.id)) as covers
        from receipts r where ${range}`),
      this.db.execute<{ completed: number; with_receipt: number }>(sql`
        select count(*)::int as completed,
               count(*) filter (where exists (select 1 from receipts x where x.reservation_id = res.id))::int as with_receipt
        from reservations res
        where res.restaurant_id = ${restaurantId} and res.status = 'completed'
          and res.arrival_at >= ${start.toJSDate()} and res.arrival_at < ${end.toJSDate()}`),
      this.db.execute<{ date: string; revenue: string; receipts: number }>(sql`
        select to_char(${businessDate}, 'YYYY-MM-DD') as date, sum(r.total) as revenue,
               count(*) filter (where r.transaction_type = 'sale')::int as receipts
        from receipts r where ${range} group by 1 order by 1`),
      this.db.execute<{ hour: number; revenue: string; receipts: number }>(sql`
        select extract(hour from ${local})::int as hour, sum(r.total) as revenue,
               count(*) filter (where r.transaction_type = 'sale')::int as receipts
        from receipts r where ${range} group by 1 order by 1`),
      this.db.execute<{ weekday: number; revenue: string; receipts: number }>(sql`
        select extract(isodow from ${businessDate})::int as weekday, sum(r.total) as revenue,
               count(*) filter (where r.transaction_type = 'sale')::int as receipts
        from receipts r where ${range} group by 1 order by 1`),
      this.db.execute<{ name: string; quantity: string; revenue: string; receipts: number }>(sql`
        select (array_agg(i.name order by i.name))[1] as name, sum(i.quantity) as quantity, sum(i.total) as revenue,
               count(distinct i.receipt_id)::int as receipts
        from receipt_items i join receipts r on r.id = i.receipt_id
        where ${range} group by lower(i.name) having sum(i.total) <> 0
        order by revenue desc limit 20`),
      this.db.execute<{ name: string; quantity: string; total: string; issued_at: Date }>(sql`
        select i.name, i.quantity, i.total, r.issued_at
        from receipt_items i join receipts r on r.id = i.receipt_id where ${range}`),
      this.paymentTotals(range),
    ]);

    const t = totals.rows[0];
    const revenue = num(t.revenue);
    const covers = num(t.covers);
    const dayMap = new Map(byDay.rows.map((d) => [d.date, d]));
    const fullDays: AnalyticsDto['byDay'] = [];
    for (let d = DateTime.fromISO(from); d <= DateTime.fromISO(to); d = d.plus({ days: 1 })) {
      const row = dayMap.get(d.toISODate()!);
      fullDays.push({ date: d.toISODate()!, revenue: round2(num(row?.revenue)), receipts: row?.receipts ?? 0 });
    }

    return {
      from,
      to,
      revenue: round2(revenue),
      receipts: t.sales,
      averageReceipt: t.sales ? round2(revenue / t.sales) : null,
      coversWithReceipt: covers,
      revenuePerCover: covers ? round2(num(t.assigned_revenue) / covers) : null,
      completedReservations: coverage.rows[0].completed,
      completedWithReceipt: coverage.rows[0].with_receipt,
      byDay: fullDays,
      byHour: byHour.rows.map((h) => ({ hour: h.hour, revenue: round2(num(h.revenue)), receipts: h.receipts })),
      byWeekday: byWeekday.rows.map((w) => ({ weekday: w.weekday, revenue: round2(num(w.revenue)), receipts: w.receipts })),
      topItems: topItems.rows.map((i) => ({ name: i.name, quantity: num(i.quantity), revenue: round2(num(i.revenue)), receipts: i.receipts })),
      itemsByShift: this.itemsByShift(r, itemRows.rows),
      payments,
    };
  }

  /** Best sellers per shift: which products sell at lunch vs dinner. */
  private itemsByShift(r: RestaurantRow, rows: Array<{ name: string; quantity: string; total: string; issued_at: Date }>): AnalyticsDto['itemsByShift'] {
    const shifts = new Map<string, Map<string, { name: string; quantity: number; revenue: number }>>();
    for (const row of rows) {
      const shift = shiftAt(r, DateTime.fromJSDate(new Date(row.issued_at)))?.name ?? OUTSIDE_SHIFTS;
      const items = shifts.get(shift) ?? new Map();
      shifts.set(shift, items);
      const key = row.name.toLowerCase();
      const it = items.get(key) ?? { name: row.name, quantity: 0, revenue: 0 };
      it.quantity += num(row.quantity);
      it.revenue += num(row.total);
      items.set(key, it);
    }
    const order = [...new Set(Object.values(r.openingHours).flatMap((list) => (list ?? []).map((s) => s.name))), OUTSIDE_SHIFTS];
    return [...shifts.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([shift, items]) => ({
        shift,
        items: [...items.values()]
          .filter((i) => i.revenue !== 0)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8)
          .map((i) => ({ name: i.name, quantity: round2(i.quantity), revenue: round2(i.revenue) })),
      }));
  }

  private async paymentTotals(where: ReturnType<typeof sql>): Promise<Array<{ method: PaymentMethod; amount: number }>> {
    const { rows } = await this.db.execute<{ method: PaymentMethod; amount: string }>(sql`
      select p->>'method' as method, sum((p->>'amount')::numeric) as amount
      from receipts r, jsonb_array_elements(r.payments) p
      where ${where} group by 1 order by 2 desc`);
    return rows.map((p) => ({ method: p.method, amount: round2(num(p.amount)) }));
  }

  /** What one guest orders and spends here, from receipts of their reservations. */
  async customerInsights(restaurantId: string, customerId: string): Promise<CustomerInsights> {
    const mine = sql`r.restaurant_id = ${restaurantId} and r.reservation_id in (select id from reservations where customer_id = ${customerId})`;
    const [totals, favorites, payments, last] = await Promise.all([
      this.db.execute<{ receipts: number; total: string; visits: number; covers: string }>(sql`
        select count(*)::int as receipts, coalesce(sum(r.total), 0) as total,
               count(distinct r.reservation_id)::int as visits,
               (select coalesce(sum(res.covers), 0) from reservations res
                 where res.id in (select r.reservation_id from receipts r where ${mine})) as covers
        from receipts r where ${mine}`),
      this.db.execute<{ name: string; quantity: string; times: number; total: string }>(sql`
        select (array_agg(i.name order by i.name))[1] as name, sum(i.quantity) as quantity,
               count(distinct i.receipt_id)::int as times, sum(i.total) as total
        from receipt_items i join receipts r on r.id = i.receipt_id
        where ${mine} group by lower(i.name) having sum(i.quantity) > 0
        order by times desc, quantity desc limit 8`),
      this.paymentTotals(mine),
      this.db.execute<{ id: string }>(sql`select r.id from receipts r where ${mine} order by r.issued_at desc limit 1`),
    ]);
    const t = totals.rows[0];
    const total = num(t.total);
    const covers = num(t.covers);
    return {
      receipts: t.receipts,
      totalSpent: round2(total),
      averagePerVisit: t.visits ? round2(total / t.visits) : null,
      averagePerCover: covers ? round2(total / covers) : null,
      favoriteItems: favorites.rows.map((f) => ({ name: f.name, quantity: num(f.quantity), times: f.times, total: round2(num(f.total)) })),
      payments,
      lastReceipt: last.rows[0] ? await this.receipts.get(restaurantId, last.rows[0].id) : null,
    };
  }
}
