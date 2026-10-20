import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { loginSchema, type LoginInput, type UserDto } from '@hostly/shared';
import { env } from '../config/env';
import { CurrentUser, Public, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { SESSION_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(loginSchema)) body: LoginInput, @Res({ passthrough: true }) res: Response): Promise<UserDto> {
    const { user, token } = await this.auth.login(body.email, body.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env().COOKIE_SECURE,
      maxAge: env().JWT_TTL_HOURS * 3600 * 1000,
      path: '/',
    });
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): UserDto {
    return { id: user.id, restaurantId: user.restaurantId, email: user.email, name: user.name, role: user.role };
  }
}
