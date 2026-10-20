import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { emailIndex } from '../common/crypto';
import type { UserDto } from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { restaurants, users, type UserRow } from '../db/schema';
import type { AuthUser } from '../common/decorators';

/** Ids only: the token is signed, not encrypted, so it carries no personal data. */
interface JwtPayload {
  sub: string;
  rid: string;
}

export const toUserDto = (u: UserRow): UserDto => ({
  id: u.id,
  restaurantId: u.restaurantId,
  email: u.email,
  name: u.name,
  role: u.role,
});

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ user: UserDto; token: string }> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.emailIndex, emailIndex(email)!));
    // Compare against a dummy hash when the user is missing so timing does not leak which emails exist.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    if (await this.isSuspended(user.restaurantId)) throw new ForbiddenException('This restaurant account is suspended. Contact Hostly support.');
    return { user: toUserDto(user), token: await this.sign(user) };
  }

  private async isSuspended(restaurantId: string) {
    const [r] = await this.db.select({ suspendedAt: restaurants.suspendedAt }).from(restaurants).where(eq(restaurants.id, restaurantId));
    return !r || r.suspendedAt !== null;
  }

  sign(user: UserRow): Promise<string> {
    const payload: JwtPayload = { sub: user.id, rid: user.restaurantId };
    return this.jwt.signAsync(payload);
  }

  /**
   * Verifies the token and re-reads the user, so a deleted user or a changed
   * role takes effect immediately instead of when the token expires.
   */
  async verify(token: string): Promise<AuthUser | null> {
    let p: JwtPayload;
    try {
      p = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      return null;
    }
    // Ids only from the token; the user (and their restaurant not being suspended) is re-checked every time.
    if (typeof p.sub !== 'string' || typeof p.rid !== 'string') return null;
    const [row] = await this.db
      .select({ user: users, suspendedAt: restaurants.suspendedAt })
      .from(users)
      .innerJoin(restaurants, eq(restaurants.id, users.restaurantId))
      .where(and(eq(users.id, p.sub), eq(users.restaurantId, p.rid)));
    if (!row || row.suspendedAt) return null;
    const user = row.user;
    return { id: user.id, restaurantId: user.restaurantId, role: user.role, name: user.name, email: user.email };
  }

  static hash(password: string) {
    return bcrypt.hash(password, 10);
  }
}
