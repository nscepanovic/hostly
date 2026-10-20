import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { loginSchema, type LoginInput } from '@hostly/shared';
import { Public } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { ADMIN_COOKIE, AdminAuthService, type AdminUser } from './admin-auth.service';
import { AdminGuard, CurrentAdmin } from './admin.guard';

/** Admin routes skip the staff guard (@Public) and use AdminGuard instead. */
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Res({ passthrough: true }) res: Response): Promise<AdminUser> {
    const { admin, token } = await this.auth.login(body.email, body.password);
    res.cookie(ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env().COOKIE_SECURE,
      maxAge: AdminAuthService.ttlMs,
      path: '/api/admin',
    });
    return admin;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_COOKIE, { path: '/api/admin' });
  }

  @UseGuards(AdminGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminUser): AdminUser {
    return admin;
  }
}
