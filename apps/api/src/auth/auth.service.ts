import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { emailIndex } from '../common/crypto';
import type { UserDto } from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { users, type UserRow } from '../db/schema';
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
    return { user: toUserDto(user), token: await this.sign(user) };
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
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, p.sub), eq(users.restaurantId, p.rid)));
    if (!user) return null;
    return { id: user.id, restaurantId: user.restaurantId, role: user.role, name: user.name, email: user.email };
  }

  static hash(password: string) {
    return bcrypt.hash(password, 10);
  }
}
