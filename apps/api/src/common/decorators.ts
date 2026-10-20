import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@hostly/shared';

export interface AuthUser {
  id: string;
  restaurantId: string;
  role: Role;
  name: string;
  email: string;
}

export const IS_PUBLIC = 'isPublic';
/** Skips authentication for a route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
