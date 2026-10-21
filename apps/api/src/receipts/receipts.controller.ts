import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  analyticsQuerySchema,
  receiptAssignSchema,
  receiptScanSchema,
  type AnalyticsDto,
  type CustomerInsights,
  type ReceiptDto,
  type ReceiptScanInput,
} from '@hostly/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AnalyticsService } from './analytics.service';
import { ReceiptsService } from './receipts.service';

const listQuery = z.object({
  reservationId: z.uuid().optional(),
  unassigned: z.enum(['1', 'true']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** Scanned QR / pasted link. Items are fetched right away (or retried later). */
  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  scan(@CurrentUser() user: AuthUser, @Body(new ZodPipe(receiptScanSchema)) body: ReceiptScanInput): Promise<ReceiptDto> {
    return this.receipts.scan(user.restaurantId, user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>): Promise<ReceiptDto[]> {
    return this.receipts.list(user.restaurantId, {
      reservationId: q.reservationId,
      unassigned: !!q.unassigned,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      limit: q.limit,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ReceiptDto> {
    return this.receipts.get(user.restaurantId, id);
  }

  @Patch(':id')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(receiptAssignSchema)) body: z.infer<typeof receiptAssignSchema>,
  ): Promise<ReceiptDto> {
    return this.receipts.assign(user.restaurantId, id, body.reservationId);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<ReceiptDto> {
    return this.receipts.retry(user.restaurantId, id);
  }

  /** Owner only: deleting changes revenue. Staff can unlink a receipt instead. */
  @Delete(':id')
  @Roles('owner')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.receipts.remove(user.restaurantId, id);
  }
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @Roles('owner')
  summary(@CurrentUser() user: AuthUser, @Query(new ZodPipe(analyticsQuerySchema)) q: z.infer<typeof analyticsQuerySchema>): Promise<AnalyticsDto> {
    return this.analytics.summary(user.restaurantId, q.from, q.to);
  }

  /** What a guest likes and spends; shown on the guest profile to all staff. */
  @Get('customers/:id')
  customer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CustomerInsights> {
    return this.analytics.customerInsights(user.restaurantId, id);
  }
}
