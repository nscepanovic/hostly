import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { pushSubscriptionSchema, type PushStatusDto, type PushSubscriptionInput } from '@hostly/shared';
import { CurrentUser, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PushService } from './push.service';

const deviceQuery = z.object({ deviceId: z.string().min(8).max(64).optional() });

/** Staff push notifications for this device; every signed-in user manages their own devices. */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get()
  status(@CurrentUser() user: AuthUser, @Query(new ZodPipe(deviceQuery)) q: z.infer<typeof deviceQuery>): Promise<PushStatusDto> {
    return this.push.status(user, q.deviceId);
  }

  @Put('subscription')
  subscribe(@CurrentUser() user: AuthUser, @Body(new ZodPipe(pushSubscriptionSchema)) body: PushSubscriptionInput): Promise<PushStatusDto> {
    return this.push.subscribe(user, body);
  }

  @Delete('subscription')
  @HttpCode(204)
  async unsubscribe(@CurrentUser() user: AuthUser, @Query('endpoint') endpoint = ''): Promise<void> {
    await this.push.unsubscribe(user, endpoint);
  }

  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() user: AuthUser, @Body(new ZodPipe(z.object({ deviceId: z.string().min(8).max(64) }))) body: { deviceId: string }) {
    return this.push.test(user, body.deviceId);
  }
}
