import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { emailIndex } from '../common/crypto';
import { InjectDb, type Db } from '../db/db.module';
import { platformAdmins, type PlatformAdminRow } from '../db/schema';

export const ADMIN_COOKIE = 'hostly_admin';
const ADMIN_TTL_HOURS = 12;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

interface AdminJwt {
  sub: string;
  typ: 'admin';
}

const toAdmin = (a: PlatformAdminRow): AdminUser => ({ id: a.id, email: a.email, name: a.name });

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ admin: AdminUser; token: string }> {
    const [row] = await this.db.select().from(platformAdmins).where(eq(platformAdmins.emailIndex, emailIndex(email)!));
    const ok = await bcrypt.compare(password, row?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!row || !ok) throw new UnauthorizedException('Invalid email or password');
    await this.db.update(platformAdmins).set({ lastLoginAt: new Date() }).where(eq(platformAdmins.id, row.id));
    const payload: AdminJwt = { sub: row.id, typ: 'admin' };
    return { admin: toAdmin(row), token: await this.jwt.signAsync(payload, { expiresIn: `${ADMIN_TTL_HOURS}h` }) };
  }

  /** Admin tokens are typed, so a staff token can never pass as an admin one (or the reverse). */
  async verify(token: string): Promise<AdminUser | null> {
    let p: AdminJwt;
    try {
      p = await this.jwt.verifyAsync<AdminJwt>(token);
    } catch {
      return null;
    }
    if (p.typ !== 'admin' || typeof p.sub !== 'string') return null;
    const [row] = await this.db.select().from(platformAdmins).where(eq(platformAdmins.id, p.sub));
    return row ? toAdmin(row) : null;
  }

  static readonly ttlMs = ADMIN_TTL_HOURS * 3600 * 1000;
}
