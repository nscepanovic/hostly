import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  onlineSettingsSchema,
  restaurantSettingsSchema,
  type OnlineSettings,
  type RestaurantDto,
  type RestaurantSettingsInput,
} from '@hostly/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantService } from './restaurant.service';

@Controller('restaurant')
export class RestaurantController {
  constructor(
    private readonly restaurants: RestaurantService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<RestaurantDto> {
    return this.restaurants.getDto(user.restaurantId);
  }

  @Put()
  @Roles('owner')
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(restaurantSettingsSchema)) body: RestaurantSettingsInput,
  ): Promise<RestaurantDto> {
    await this.restaurants.updateSettings(user.restaurantId, body);
    this.realtime.emit(user.restaurantId, 'settings.updated', {});
    return this.restaurants.getDto(user.restaurantId);
  }

  @Put('online')
  @Roles('owner')
  async updateOnline(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(onlineSettingsSchema)) body: OnlineSettings,
  ): Promise<RestaurantDto> {
    await this.restaurants.updateOnline(user.restaurantId, body);
    this.realtime.emit(user.restaurantId, 'settings.updated', {});
    return this.restaurants.getDto(user.restaurantId);
  }
}
