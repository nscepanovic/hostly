import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { LANGUAGE_INFO, normalizePhone, type CustomerDto, type CustomerInput, type Language } from '@hostly/shared';
import { guestFieldQueryTokens, guestQueryTokens, phoneIndex, type GuestField } from '../common/crypto';
import { customerIndexes } from './customer-indexes';
import { rethrowConflict } from '../common/pg-errors';
import { InjectDb, type Db } from '../db/db.module';
import { customers, reservations, reservationTables, restaurants, tables, type CustomerRow } from '../db/schema';
import { guestBookRestaurants } from '../db/tenant';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantService } from '../restaurant/restaurant.service';

export type CustomerSort = 'lastName' | 'firstName' | 'phone' | 'email' | 'visits' | 'createdAt';

export interface VisitDto {
  id: string;
  /** Which restaurant of the guest book the visit was at. */
  restaurant: string;
  arrivalAt: string;
  covers: number;
  status: string;
  tables: string[];
  spend: number | null;
}

/** Matching guests considered for suggestions before ranking. */
const SUGGEST_SCAN = 500;

type Stats = { visits: number; cancellations: number; noShows: number; lastVisitAt: Date | string | null };
const NO_STATS: Stats = { visits: 0, cancellations: 0, noShows: 0, lastVisitAt: null };

const toDto = (c: CustomerRow, st: Stats = NO_STATS): CustomerDto => ({
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
    visits: st.visits,
    cancellations: st.cancellations,
    noShows: st.noShows,
    lastVisitAt: st.lastVisitAt ? new Date(st.lastVisitAt).toISOString() : null,
  },
});

const collators = new Map<Language, Intl.Collator>();
/** Name sorting follows the restaurant's language (e.g. č after c in Serbian). */
const collatorFor = (lang: Language) => {
  let c = collators.get(lang);
  if (!c) collators.set(lang, (c = new Intl.Collator(LANGUAGE_INFO[lang].locale, { sensitivity: 'base', numeric: true })));
  return c;
};

@Injectable()
export class CustomersService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: RealtimeService,
    private readonly restaurants: RestaurantService,
  ) {}

  /** Customers are scoped by the restaurant's guest book (shared by a group of restaurants or private). */
  private async book(restaurantId: string): Promise<string> {
    return (await this.restaurants.get(restaurantId)).guestBookId;
  }

  /** Every restaurant sharing the book sees guest changes live. */
  private async emitChanged(guestBookId: string, id: string) {
    for (const r of await guestBookRestaurants(this.db, guestBookId)) this.realtime.emit(r.id, 'customer.updated', { id });
  }

  /** Visit counters for the given customers, from all restaurants of their guest book. */
  private async stats(customerIds: string[]): Promise<Map<string, Stats>> {
    if (!customerIds.length) return new Map();
    const rows = await this.db
      .select({
        id: reservations.customerId,
        visits: sql<number>`count(*) filter (where ${reservations.status} in ('completed','seated'))::int`,
        cancellations: sql<number>`count(*) filter (where ${reservations.status} = 'cancelled')::int`,
        noShows: sql<number>`count(*) filter (where ${reservations.status} = 'no_show')::int`,
        lastVisitAt: sql<string | null>`max(${reservations.arrivalAt}) filter (where ${reservations.status} in ('completed','seated'))`,
      })
      .from(reservations)
      .where(inArray(reservations.customerId, customerIds))
      .groupBy(reservations.customerId);
    return new Map(rows.map((r) => [r.id!, r]));
  }

  /**
   * Names, phones and emails are encrypted, so filtering uses blind-index search
   * tokens in SQL, and sorting happens after decryption. A guest book holds a
   * restaurant group's guests (thousands, not millions), which keeps this cheap.
   */
  async list(
    restaurantId: string,
    opts: { search?: string; sort?: CustomerSort; dir?: 'asc' | 'desc'; limit: number; offset: number },
  ): Promise<{ total: number; items: CustomerDto[] }> {
    const restaurant = await this.restaurants.get(restaurantId);
    const collator = collatorFor(restaurant.defaultLanguage);
    const conds: SQL[] = [eq(customers.guestBookId, restaurant.guestBookId)];
    if (opts.search?.trim()) {
      const groups = guestQueryTokens(opts.search);
      if (!groups.length) return { total: 0, items: [] };
      // Every word must match (AND); a word may match a name or an email token (OR).
      for (const g of groups) conds.push(sql`${customers.searchTokens} && ${sql.param(g)}::text[]`);
    }
    const rows = await this.db.select().from(customers).where(and(...conds));
    const stats = await this.stats(rows.map((r) => r.id));
    const sort = opts.sort ?? 'lastName';
    const dir = opts.dir === 'desc' ? -1 : 1;
    const key = (c: CustomerRow): string | number | null => {
      switch (sort) {
        case 'visits':
          return stats.get(c.id)?.visits ?? 0;
        case 'createdAt':
          return c.createdAt.getTime();
        default:
          return c[sort];
      }
    };
    rows.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      // Blanks last in either direction.
      if (x === null || x === '') return y === null || y === '' ? 0 : 1;
      if (y === null || y === '') return -1;
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      return cmp * dir || a.id.localeCompare(b.id);
    });
    const page = rows.slice(opts.offset, opts.offset + opts.limit);
    return { total: rows.length, items: page.map((c) => toDto(c, stats.get(c.id))) };
  }

  /**
   * As-you-type guest suggestions for the reservation form: guests whose name,
   * phone or email (by `field`) starts with what was typed. Regulars first.
   */
  async suggest(restaurantId: string, field: GuestField, query: string, limit: number): Promise<CustomerDto[]> {
    const groups = guestFieldQueryTokens(field, query);
    if (!groups.length) return [];
    const conds: SQL[] = [eq(customers.guestBookId, await this.book(restaurantId))];
    for (const g of groups) conds.push(sql`${customers.searchTokens} && ${sql.param(g)}::text[]`);
    // Ranking needs visit stats, so it runs here on a bounded set (a 2-letter prefix can match many guests).
    const rows = await this.db.select().from(customers).where(and(...conds)).orderBy(desc(customers.createdAt)).limit(SUGGEST_SCAN);
    const stats = await this.stats(rows.map((r) => r.id));
    const visits = (id: string) => stats.get(id)?.visits ?? 0;
    const last = (id: string) => {
      const at = stats.get(id)?.lastVisitAt;
      return at ? new Date(at).getTime() : 0;
    };
    rows.sort((a, b) => visits(b.id) - visits(a.id) || last(b.id) - last(a.id) || b.createdAt.getTime() - a.createdAt.getTime());
    return rows.slice(0, limit).map((c) => toDto(c, stats.get(c.id)));
  }

  async get(restaurantId: string, id: string): Promise<CustomerDto> {
    const [row] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.guestBookId, await this.book(restaurantId))));
    if (!row) throw new NotFoundException('Customer not found');
    return toDto(row, (await this.stats([row.id])).get(row.id));
  }

  async lookupByPhone(restaurantId: string, phone: string): Promise<CustomerDto | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    const [row] = await this.db
      .select()
      .from(customers)
      .where(and(eq(customers.guestBookId, await this.book(restaurantId)), eq(customers.phoneIndex, phoneIndex(normalized)!)));
    return row ? toDto(row, (await this.stats([row.id])).get(row.id)) : null;
  }

  private values(input: CustomerInput) {
    const contact = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: normalizePhone(input.phone) ?? input.phone ?? null,
      email: input.email,
    };
    return {
      ...contact,
      ...customerIndexes(contact),
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
      const guestBookId = await this.book(restaurantId);
      const [row] = await this.db.insert(customers).values({ restaurantId, guestBookId, ...this.values(input) }).returning();
      await this.emitChanged(guestBookId, row.id);
      return this.get(restaurantId, row.id);
    } catch (err) {
      rethrowConflict(err, { unique: 'A customer with this phone number already exists' });
    }
  }

  async update(restaurantId: string, id: string, input: CustomerInput): Promise<CustomerDto> {
    const guestBookId = await this.book(restaurantId);
    try {
      const [row] = await this.db
        .update(customers)
        .set(this.values(input))
        .where(and(eq(customers.id, id), eq(customers.guestBookId, guestBookId)))
        .returning();
      if (!row) throw new NotFoundException('Customer not found');
      await this.emitChanged(guestBookId, id);
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
        restaurant: restaurants.name,
        arrivalAt: reservations.arrivalAt,
        covers: reservations.covers,
        status: reservations.status,
        spend: reservations.spend,
        tables: sql<string[]>`coalesce(array_agg(${tables.label} order by ${tables.label}) filter (where ${tables.id} is not null), '{}')`,
      })
      .from(reservations)
      .innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
      .leftJoin(reservationTables, eq(reservationTables.reservationId, reservations.id))
      .leftJoin(tables, eq(tables.id, reservationTables.tableId))
      // The customer is already checked to be in this book, so history spans all its restaurants.
      .where(eq(reservations.customerId, id))
      .groupBy(reservations.id, restaurants.name)
      .orderBy(desc(reservations.arrivalAt))
      .limit(200);
    return rows.map((r) => ({ ...r, arrivalAt: r.arrivalAt.toISOString() }));
  }
}
