import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController, ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  controllers: [ReceiptsController, AnalyticsController],
  providers: [ReceiptsService, AnalyticsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
