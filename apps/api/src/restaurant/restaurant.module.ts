import { Global, Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';

@Global()
@Module({ controllers: [RestaurantController], providers: [RestaurantService], exports: [RestaurantService] })
export class RestaurantModule {}
