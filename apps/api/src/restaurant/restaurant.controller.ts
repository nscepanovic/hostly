import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  BRANDING_IMAGES,
  type BrandingImage,
  onlineSettingsSchema,
  restaurantSettingsSchema,
  type OnlineSettings,
  type RestaurantDto,
  type RestaurantSettingsInput,
} from '@hostly/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RealtimeService } from '../realtime/realtime.service';
import { MAX_IMAGE_BYTES, RestaurantService } from './restaurant.service';

const imageKind = new ParseEnumPipe(Object.fromEntries(BRANDING_IMAGES.map((k) => [k, k])));

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

  /** Booking page cover or logo: multipart field "file" (JPEG, PNG or WebP). */
  @Put('images/:kind')
  @Roles('owner')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async putImage(
    @CurrentUser() user: AuthUser,
    @Param('kind', imageKind) kind: BrandingImage,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<RestaurantDto> {
    if (!file?.buffer?.length) throw new BadRequestException('No image uploaded');
    await this.restaurants.putImage(user.restaurantId, kind, file.buffer);
    this.realtime.emit(user.restaurantId, 'settings.updated', {});
    return this.restaurants.getDto(user.restaurantId);
  }

  @Delete('images/:kind')
  @Roles('owner')
  @HttpCode(200)
  async deleteImage(@CurrentUser() user: AuthUser, @Param('kind', imageKind) kind: BrandingImage): Promise<RestaurantDto> {
    await this.restaurants.deleteImage(user.restaurantId, kind);
    this.realtime.emit(user.restaurantId, 'settings.updated', {});
    return this.restaurants.getDto(user.restaurantId);
  }
}
