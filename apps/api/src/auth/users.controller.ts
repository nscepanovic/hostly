import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { emailIndex } from '../common/crypto';
import { userCreateSchema, type UserCreateInput, type UserDto } from '@hostly/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { rethrowConflict } from '../common/pg-errors';
import { InjectDb, type Db } from '../db/db.module';
import { users } from '../db/schema';
import { AuthService, toUserDto } from './auth.service';

@Controller('users')
@Roles('owner')
export class UsersController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Get()
  async list(@CurrentUser() me: AuthUser): Promise<UserDto[]> {
    const rows = await this.db.select().from(users).where(eq(users.restaurantId, me.restaurantId));
    // Names are encrypted, so sorting happens after decryption.
    return rows.map(toUserDto).sort((a, b) => a.name.localeCompare(b.name));
  }

  @Post()
  async create(@CurrentUser() me: AuthUser, @Body(new ZodPipe(userCreateSchema)) body: UserCreateInput): Promise<UserDto> {
    try {
      const [row] = await this.db
        .insert(users)
        .values({
          restaurantId: me.restaurantId,
          email: body.email.toLowerCase(),
          emailIndex: emailIndex(body.email)!,
          name: body.name,
          role: body.role,
          passwordHash: await AuthService.hash(body.password),
        })
        .returning();
      return toUserDto(row);
    } catch (err) {
      rethrowConflict(err, { unique: 'A user with this email already exists' });
    }
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === me.id) throw new BadRequestException('You cannot delete yourself');
    const deleted = await this.db
      .delete(users)
      .where(and(eq(users.id, id), eq(users.restaurantId, me.restaurantId)))
      .returning({ id: users.id });
    if (!deleted.length) throw new NotFoundException();
  }
}
