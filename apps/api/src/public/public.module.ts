import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicController } from './public.controller';

@Module({ imports: [ReservationsModule], controllers: [PublicController], providers: [PublicAvailabilityService] })
export class PublicModule {}
