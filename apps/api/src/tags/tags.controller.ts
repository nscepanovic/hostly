import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { tagSchema, type TagDto, type TagInput } from '@hostly/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { rethrowConflict } from '../common/pg-errors';
import { ZodPipe } from '../common/zod.pipe';
import { InjectDb, type Db } from '../db/db.module';
import { tags, type TagRow } from '../db/schema';

const toDto = (t: TagRow): TagDto => ({ id: t.id, kind: t.kind, label: t.label, color: t.color });

@Controller('tags')
export class TagsController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<TagDto[]> {
    const rows = await this.db.select().from(tags).where(eq(tags.restaurantId, user.restaurantId)).orderBy(asc(tags.kind), asc(tags.label));
    return rows.map(toDto);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(tagSchema)) body: TagInput): Promise<TagDto> {
    try {
      const [row] = await this.db.insert(tags).values({ restaurantId: user.restaurantId, ...body }).returning();
      return toDto(row);
    } catch (err) {
      rethrowConflict(err, { unique: 'Tag already exists' });
    }
  }

  @Delete(':id')
  @Roles('owner')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.restaurantId, user.restaurantId)))
      .returning();
    if (!rows.length) throw new NotFoundException();
  }
}
