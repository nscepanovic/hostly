import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import type { Role, UserDto } from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { users, type UserRow } from '../db/schema';
import type { AuthUser } from '../common/decorators';

interface JwtPayload {
  sub: string;
  rid: string;
  role: Role;
  name: string;
  email: string;
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
      .where(eq(sql`lower(${users.email})`, email.toLowerCase()));
    // Compare against a dummy hash when the user is missing so timing does not leak which emails exist.
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    return { user: toUserDto(user), token: await this.sign(user) };
  }

  sign(user: UserRow): Promise<string> {
    const payload: JwtPayload = { sub: user.id, rid: user.restaurantId, role: user.role, name: user.name, email: user.email };
    return this.jwt.signAsync(payload);
  }

  async verify(token: string): Promise<AuthUser | null> {
    try {
      const p = await this.jwt.verifyAsync<JwtPayload>(token);
      return { id: p.sub, restaurantId: p.rid, role: p.role, name: p.name, email: p.email };
    } catch {
      return null;
    }
  }

  static hash(password: string) {
    return bcrypt.hash(password, 10);
  }
}
