import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_HEADER } from '../auth/auth.constants';
import { ADMIN_COOKIE, AdminAuthService, type AdminUser } from './admin-auth.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Platform-admin session (separate cookie and token type from restaurant staff). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: AdminUser }>();
    const token = req.cookies?.[ADMIN_COOKIE] as string | undefined;
    const admin = token ? await this.auth.verify(token) : null;
    if (!admin) throw new UnauthorizedException();
    if (!SAFE.has(req.method) && !req.headers[CSRF_HEADER]) throw new ForbiddenException('Missing CSRF header');
    req.admin = admin;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator((_d: unknown, ctx: ExecutionContext): AdminUser => ctx.switchToHttp().getRequest().admin);
