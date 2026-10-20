import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { LANGUAGES, ROLES, type AdminActivityDto, type AdminMessageDto, type AdminOverviewDto, type AdminRestaurantDetail, type AdminRestaurantRow } from '@hostly/shared';
import { Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AdminUser } from './admin-auth.service';
import { AdminGuard, CurrentAdmin } from './admin.guard';
import { AdminService } from './admin.service';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(50),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.email(),
  ownerPassword: z.string().min(8).max(200),
  timezone: z.string().optional(),
  language: z.enum(LANGUAGES).optional(),
  shareGuestsWith: z.uuid().optional(),
});
const suspendSchema = z.object({ suspended: z.boolean() });
const shareSchema = z.object({ withRestaurantId: z.uuid() });
const userSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.email(), password: z.string().min(8).max(200), role: z.enum(ROLES) });
const passwordSchema = z.object({ password: z.string().min(8).max(200) });
const listQuery = z.object({
  restaurantId: z.uuid().optional(),
  status: z.enum(['sent', 'failed', 'queued']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Platform administration. @Public skips the staff guard; AdminGuard requires an admin session. */
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(): Promise<AdminOverviewDto> {
    return this.admin.overview();
  }

  @Get('restaurants')
  restaurants(): Promise<AdminRestaurantRow[]> {
    return this.admin.restaurants();
  }

  @Post('restaurants')
  create(@CurrentAdmin() me: AdminUser, @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>): Promise<AdminRestaurantDetail> {
    return this.admin.create(me, body);
  }

  @Get('restaurants/:id')
  restaurant(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRestaurantDetail> {
    return this.admin.restaurant(id);
  }

  @Patch('restaurants/:id')
  suspend(
    @CurrentAdmin() me: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(suspendSchema)) body: z.infer<typeof suspendSchema>,
  ): Promise<AdminRestaurantDetail> {
    return this.admin.setSuspended(me, id, body.suspended);
  }

  @Post('restaurants/:id/share-guests')
  @HttpCode(200)
  share(@CurrentAdmin() me: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(shareSchema)) body: z.infer<typeof shareSchema>) {
    return this.admin.share(me, id, body.withRestaurantId);
  }

  @Post('restaurants/:id/unshare-guests')
  @HttpCode(200)
  unshare(@CurrentAdmin() me: AdminUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.unshare(me, id);
  }

  @Post('restaurants/:id/users')
  addUser(@CurrentAdmin() me: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(userSchema)) body: z.infer<typeof userSchema>) {
    return this.admin.addUser(me, id, body);
  }

  @Post('users/:id/password')
  @HttpCode(204)
  async resetPassword(@CurrentAdmin() me: AdminUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(passwordSchema)) body: z.infer<typeof passwordSchema>) {
    await this.admin.resetPassword(me, id, body.password);
  }

  @Get('activity')
  activity(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>): Promise<AdminActivityDto[]> {
    return this.admin.activity(q);
  }

  @Get('messages')
  messages(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>): Promise<AdminMessageDto[]> {
    return this.admin.messages(q);
  }
}
