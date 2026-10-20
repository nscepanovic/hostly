import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { normalizePhone, phoneDigits, type CustomerDto, type CustomerInput } from '@hostly/shared';
import { rethrowConflict } from '../common/pg-errors';
import { InjectDb, type Db } from '../db/db.module';
import { customers, reservations, reservationTables, tables, type CustomerRow } from '../db/schema';
import { RealtimeService } from '../realtime/realtime.service';

export type CustomerSort = 'lastName' | 'firstName' | 'phone' | 'email' | 'visits' | 'createdAt';

export interface VisitDto {
  id: string;
  arrivalAt: string;
  covers: number;
  status: string;
  tables: string[];
  spend: number | null;
}

// Counters as correlated subqueries so list sorting by visits stays in SQL.
const visitsSql = sql<number>`(select count(*)::int from ${reservations} r where r.customer_id = "customers"."id" and r.status in ('completed','seated'))`;
const cancelSql = sql<number>`(select count(*)::int from ${reservations} r where r.customer_id = "customers"."id" and r.status = 'cancelled')`;
const noShowSql = sql<number>`(select count(*)::int from ${reservations} r where r.customer_id = "customers"."id" and r.status = 'no_show')`;
const lastVisitSql = sql<Date | null>`(select max(r.arrival_at) from ${reservations} r where r.customer_id = "customers"."id" and r.status in ('completed','seated'))`;

const toDto = (c: CustomerRow & { visits: number; cancellations: number; noShows: number; lastVisitAt: Date | string | null }): CustomerDto => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  phone: c.phone,
  email: c.email,
  language: c.language,
  birthday: c.birthday,
  company: c.company,
  type: c.type,
  notes: c.notes,
  tags: c.tags,
  averageSpend: c.averageSpend,
  createdAt: c.createdAt.toISOString(),
  stats: {
    visits: c.visits,
    cancellations: c.cancellations,
    noShows: c.noShows,
    lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt).toISOString() : null,
  },
});

@Injectable()
export class CustomersService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  private selectWithStats() {
    return this.db
      .select({ c: customers, visits: visitsSql, cancellations: cancelSql, noShows: noShowSql, lastVisitAt: lastVisitSql })
      .from(customers);
  }

  async list(
    restaurantId: string,
    opts: { search?: string; sort?: CustomerSort; dir?: 'asc' | 'desc'; limit: number; offset: number },
  ): Promise<{ total: number; items: CustomerDto[] }> {
    const conds: SQL[] = [eq(customers.restaurantId, restaurantId)];
    const q = opts.search?.trim();
    if (q) {
      const like = `%${q}%`;
      const digits = phoneDigits(q);
      conds.push(
        or(
          ilike(customers.firstName, like),
          ilike(customers.lastName, like),
          ilike(customers.email, like),
          ilike(customers.company, like),
          sql`(${customers.firstName} || ' ' || ${customers.lastName}) ilike ${like}`,
          sql`(${customers.lastName} || ' ' || ${customers.firstName}) ilike ${like}`,
          // Match local and international forms: "064 99" and "+381 64 99" both hit +3816499...
          ...(digits.length >= 3
            ? [sql`regexp_replace(${customers.phone}, '\\D', '', 'g') like ${`%${digits.replace(/^0/, '')}%`}`]
            : []),
        )!,
      );
    }
    const where = and(...conds);
    const sortCol = {
      lastName: customers.lastName,
      firstName: customers.firstName,
      phone: customers.phone,
      email: customers.email,
      createdAt: customers.createdAt,
      visits: visitsSql,
    }[opts.sort ?? 'lastName'];
    const order = opts.dir === 'desc' ? sql`${sortCol} desc nulls last` : sql`${sortCol} asc nulls last`;

    const [rows, [{ total }]] = await Promise.all([
      this.selectWithStats().where(where).orderBy(order, asc(customers.id)).limit(opts.limit).offset(opts.offset),
      this.db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
    ]);
    return { total, items: rows.map((r) => toDto({ ...r.c, ...r })) };
  }

  async get(restaurantId: string, id: string): Promise<CustomerDto> {
    const [row] = await this.selectWithStats().where(and(eq(customers.id, id), eq(customers.restaurantId, restaurantId)));
    if (!row) throw new NotFoundException('Customer not found');
    return toDto({ ...row.c, ...row });
  }

  async lookupByPhone(restaurantId: string, phone: string): Promise<CustomerDto | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const [row] = await this.selectWithStats().where(and(eq(customers.restaurantId, restaurantId), eq(customers.phone, normalized)));
    return row ? toDto({ ...row.c, ...row }) : null;
  }

  private values(input: CustomerInput) {
    return {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: normalizePhone(input.phone) ?? input.phone ?? null,
      email: input.email,
      language: input.language ?? null,
      birthday: input.birthday ?? null,
      company: input.company,
      type: input.type,
      notes: input.notes,
      tags: input.tags,
      averageSpend: input.averageSpend ?? null,
    };
  }

  async create(restaurantId: string, input: CustomerInput): Promise<CustomerDto> {
    try {
      const [row] = await this.db.insert(customers).values({ restaurantId, ...this.values(input) }).returning();
      this.realtime.emit(restaurantId, 'customer.updated', { id: row.id });
      return this.get(restaurantId, row.id);
    } catch (err) {
      rethrowConflict(err, { unique: 'A customer with this phone number already exists' });
    }
  }

  async update(restaurantId: string, id: string, input: CustomerInput): Promise<CustomerDto> {
    try {
      const [row] = await this.db
        .update(customers)
        .set(this.values(input))
        .where(and(eq(customers.id, id), eq(customers.restaurantId, restaurantId)))
        .returning();
      if (!row) throw new NotFoundException('Customer not found');
      this.realtime.emit(restaurantId, 'customer.updated', { id });
      return this.get(restaurantId, id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      rethrowConflict(err, { unique: 'A customer with this phone number already exists' });
    }
  }

  async visits(restaurantId: string, id: string): Promise<VisitDto[]> {
    await this.get(restaurantId, id);
    const rows = await this.db
      .select({
        id: reservations.id,
        arrivalAt: reservations.arrivalAt,
        covers: reservations.covers,
        status: reservations.status,
        spend: reservations.spend,
        tables: sql<string[]>`coalesce(array_agg(${tables.label} order by ${tables.label}) filter (where ${tables.id} is not null), '{}')`,
      })
      .from(reservations)
      .leftJoin(reservationTables, eq(reservationTables.reservationId, reservations.id))
      .leftJoin(tables, eq(tables.id, reservationTables.tableId))
      .where(and(eq(reservations.customerId, id), eq(reservations.restaurantId, restaurantId)))
      .groupBy(reservations.id)
      .orderBy(desc(reservations.arrivalAt))
      .limit(200);
    return rows.map((r) => ({ ...r, arrivalAt: r.arrivalAt.toISOString() }));
  }
}
