import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@hostly/shared';
import { IS_PUBLIC, ROLES_KEY } from '../common/decorators';
import { CSRF_HEADER, SESSION_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Global guard: session cookie auth, CSRF header check on writes, and @Roles. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const user = token ? await this.auth.verify(token) : null;
    if (!user) throw new UnauthorizedException();
    if (!SAFE_METHODS.has(req.method) && !req.headers[CSRF_HEADER]) {
      throw new ForbiddenException('Missing CSRF header');
    }
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role)) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
