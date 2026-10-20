import { Module } from '@nestjs/common';
import { WaitingController } from '../waiting/waiting.controller';
import { WaitingService } from '../waiting/waiting.service';
import { AvailabilityService } from './availability.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  controllers: [ReservationsController, WaitingController],
  providers: [AvailabilityService, ReservationsService, WaitingService],
  exports: [AvailabilityService, ReservationsService, WaitingService],
})
export class ReservationsModule {}
