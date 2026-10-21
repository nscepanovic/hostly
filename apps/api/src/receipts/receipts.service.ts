import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { ReceiptDto, ReceiptScanInput } from '@hostly/shared';
import { isUniqueViolation } from '../common/pg-errors';
import { env } from '../config/env';
import { InjectDb, type Db } from '../db/db.module';
import { receiptItems, receipts, reservations, type ReceiptItemRow, type ReceiptRow } from '../db/schema';
import { RealtimeService } from '../realtime/realtime.service';
import { decodeVl, parseSufLink, ReceiptLinkError, scrapeSuf, SufRejectedError } from './suf';

/** Background attempts to fetch items before a receipt stays "failed" (retry still possible by hand). */
const MAX_ATTEMPTS = 8;

const NOT_ORIGINAL: Record<string, string> = {
  proforma: 'This is a pro-forma invoice, not a fiscal receipt',
  copy: 'This is a copy; scan the original receipt',
  training: 'This is a training receipt',
  advance: 'This is an advance payment receipt; scan the final receipt',
};

type Guest = { firstName: string | null; lastName: string | null; covers: number | null };

function toDto(r: ReceiptRow, items: ReceiptItemRow[], guest?: Guest | null): ReceiptDto {
  return {
    id: r.id,
    reservationId: r.reservationId,
    invoiceNumber: r.invoiceNumber,
    verificationUrl: r.verificationUrl,
    issuedAt: r.issuedAt.toISOString(),
    total: r.total,
    transactionType: r.transactionType,
    sellerName: r.sellerName,
    sellerTin: r.sellerTin,
    payments: r.payments,
    status: r.status,
    error: r.error,
    items: items
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ name: i.name, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total, vatLabel: i.vatLabel })),
    createdAt: r.createdAt.toISOString(),
    guestName: guest ? [guest.lastName, guest.firstName].filter(Boolean).join(' ') || null : null,
    covers: guest?.covers ?? null,
  };
}

/**
 * Fiscal receipts: staff scan the QR code, the header is decoded on the spot,
 * line items are fetched from the tax authority's verification page (and
 * retried in the background when that site is slow or down).
 * Refunds are stored with negative amounts so sums are always net.
 */
@Injectable()
export class ReceiptsService {
  private readonly log = new Logger(ReceiptsService.name);
  /** Replaced in tests; production talks to suf.purs.gov.rs. */
  fetcher: typeof fetch = (...args) => fetch(...args);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly realtime: RealtimeService,
  ) {}

  async scan(restaurantId: string, userId: string | null, input: ReceiptScanInput): Promise<ReceiptDto> {
    let link: ReturnType<typeof parseSufLink>;
    let header: ReturnType<typeof decodeVl>;
    try {
      link = parseSufLink(input.url);
      header = decodeVl(link.vl);
    } catch (err) {
      if (err instanceof ReceiptLinkError) throw new BadRequestException({ code: 'invalid_receipt', message: err.message });
      throw err;
    }
    if (header.invoiceType !== 'normal') throw new BadRequestException({ code: 'not_original', message: NOT_ORIGINAL[header.invoiceType] });
    if (input.reservationId) await this.assertReservation(restaurantId, input.reservationId);

    const sign = header.transactionType === 'refund' ? -1 : 1;
    let row: ReceiptRow;
    try {
      [row] = await this.db
        .insert(receipts)
        .values({
          restaurantId,
          reservationId: input.reservationId ?? null,
          invoiceNumber: header.invoiceNumber,
          verificationUrl: link.url,
          issuedAt: header.issuedAt,
          total: sign * header.totalAmount,
          transactionType: header.transactionType,
          createdBy: userId,
        })
        .returning();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const [existing] = await this.db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.restaurantId, restaurantId), eq(receipts.invoiceNumber, header.invoiceNumber)));
      throw new ConflictException({ code: 'duplicate', message: 'This receipt was already scanned', receipt: await this.get(restaurantId, existing.id) });
    }
    await this.fetchDetails(row.id);
    if (row.reservationId) await this.syncSpend(row.reservationId);
    return this.publish(restaurantId, row.id);
  }

  /** Loads seller, items and payments from the verification page. Never throws: failures are recorded and retried. */
  async fetchDetails(id: string): Promise<void> {
    const [row] = await this.db.select().from(receipts).where(eq(receipts.id, id));
    if (!row) return;
    const sign = row.transactionType === 'refund' ? -1 : 1;
    try {
      const d = await scrapeSuf(row.verificationUrl, this.fetcher);
      await this.db.transaction(async (tx) => {
        await tx.delete(receiptItems).where(eq(receiptItems.receiptId, id));
        if (d.items.length) {
          await tx.insert(receiptItems).values(
            d.items.map((i, position) => ({
              receiptId: id,
              restaurantId: row.restaurantId,
              position,
              name: i.name,
              unit: i.unit,
              quantity: sign * i.quantity,
              unitPrice: i.unitPrice,
              total: sign * i.total,
              vatLabel: i.vatLabel,
              vatRate: i.vatRate,
              gtin: i.gtin,
            })),
          );
        }
        await tx
          .update(receipts)
          .set({
            sellerTin: d.sellerTin,
            sellerName: d.sellerName,
            payments: d.payments.map((p) => ({ method: p.method, amount: sign * p.amount })),
            journal: d.journal,
            status: 'ready',
            error: null,
            attempts: row.attempts + 1,
            fetchedAt: new Date(),
          })
          .where(eq(receipts.id, id));
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`Receipt ${row.invoiceNumber}: ${message}`);
      await this.db
        .update(receipts)
        .set({ status: 'failed', error: message.slice(0, 500), attempts: err instanceof SufRejectedError ? MAX_ATTEMPTS : row.attempts + 1 })
        .where(eq(receipts.id, id));
    }
  }

  /** Receipts whose items could not be fetched yet (tax site down, no network). */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryPending() {
    if (env().NODE_ENV === 'test') return;
    const due = await this.db
      .select({ id: receipts.id, restaurantId: receipts.restaurantId })
      .from(receipts)
      .where(and(inArray(receipts.status, ['pending', 'failed']), lt(receipts.attempts, MAX_ATTEMPTS), gte(receipts.createdAt, sql`now() - interval '7 days'`)))
      .limit(50);
    for (const r of due) {
      await this.fetchDetails(r.id);
      await this.publish(r.restaurantId, r.id);
    }
  }

  async retry(restaurantId: string, id: string): Promise<ReceiptDto> {
    await this.get(restaurantId, id);
    await this.fetchDetails(id);
    return this.publish(restaurantId, id);
  }

  async list(
    restaurantId: string,
    opts: { reservationId?: string; unassigned?: boolean; from?: Date; to?: Date; limit?: number },
  ): Promise<ReceiptDto[]> {
    const conds = [eq(receipts.restaurantId, restaurantId)];
    if (opts.reservationId) conds.push(eq(receipts.reservationId, opts.reservationId));
    if (opts.unassigned) conds.push(isNull(receipts.reservationId));
    if (opts.from) conds.push(gte(receipts.issuedAt, opts.from));
    if (opts.to) conds.push(lt(receipts.issuedAt, opts.to));
    const rows = await this.db
      .select({ r: receipts, firstName: reservations.firstName, lastName: reservations.lastName, covers: reservations.covers })
      .from(receipts)
      .leftJoin(reservations, eq(reservations.id, receipts.reservationId))
      .where(and(...conds))
      .orderBy(desc(receipts.issuedAt))
      .limit(opts.limit ?? 200);
    const items = rows.length
      ? await this.db.select().from(receiptItems).where(inArray(receiptItems.receiptId, rows.map((x) => x.r.id))).orderBy(asc(receiptItems.position))
      : [];
    return rows.map((x) => toDto(x.r, items.filter((i) => i.receiptId === x.r.id), x.r.reservationId ? x : null));
  }

  async get(restaurantId: string, id: string): Promise<ReceiptDto> {
    const [row] = await this.db
      .select({ r: receipts, firstName: reservations.firstName, lastName: reservations.lastName, covers: reservations.covers })
      .from(receipts)
      .leftJoin(reservations, eq(reservations.id, receipts.reservationId))
      .where(and(eq(receipts.id, id), eq(receipts.restaurantId, restaurantId)));
    if (!row) throw new NotFoundException('Receipt not found');
    const items = await this.db.select().from(receiptItems).where(eq(receiptItems.receiptId, id));
    return toDto(row.r, items, row.r.reservationId ? row : null);
  }

  /** Links a receipt to a reservation (and so to its guest), or unlinks it. */
  async assign(restaurantId: string, id: string, reservationId: string | null): Promise<ReceiptDto> {
    const before = await this.get(restaurantId, id);
    if (reservationId) await this.assertReservation(restaurantId, reservationId);
    await this.db.update(receipts).set({ reservationId }).where(eq(receipts.id, id));
    for (const rid of new Set([before.reservationId, reservationId])) if (rid) await this.syncSpend(rid);
    return this.publish(restaurantId, id);
  }

  async remove(restaurantId: string, id: string): Promise<void> {
    const before = await this.get(restaurantId, id);
    await this.db.delete(receipts).where(eq(receipts.id, id));
    if (before.reservationId) await this.syncSpend(before.reservationId);
    this.realtime.emit(restaurantId, 'receipt.updated', { id });
  }

  private async assertReservation(restaurantId: string, reservationId: string) {
    const [r] = await this.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.id, reservationId), eq(reservations.restaurantId, restaurantId)));
    if (!r) throw new NotFoundException('Reservation not found');
  }

  /** The reservation's spend is the net total of its receipts (kept as is when it has none). */
  private async syncSpend(reservationId: string) {
    const [{ total, count }] = await this.db
      .select({ total: sql<string | null>`sum(${receipts.total})`, count: sql<number>`count(*)::int` })
      .from(receipts)
      .where(eq(receipts.reservationId, reservationId));
    await this.db
      .update(reservations)
      .set({ spend: count ? Number(total) : null })
      .where(eq(reservations.id, reservationId));
  }

  private async publish(restaurantId: string, id: string): Promise<ReceiptDto> {
    const receipt = await this.get(restaurantId, id);
    this.realtime.emit(restaurantId, 'receipt.updated', { id, receipt });
    return receipt;
  }
}
