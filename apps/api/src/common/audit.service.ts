import { Injectable } from '@nestjs/common';
import { desc, eq, and } from 'drizzle-orm';
import type { AuditLogDto } from '@hostly/shared';
import type { DbOrTx } from '../db/client';
import { InjectDb, type Db } from '../db/db.module';
import { auditLog, users } from '../db/schema';

@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Db) {}

  async log(
    tx: DbOrTx,
    entry: { restaurantId: string; userId: string | null; entity: string; entityId: string; action: string; before?: unknown; after?: unknown },
  ) {
    await tx.insert(auditLog).values({
      restaurantId: entry.restaurantId,
      userId: entry.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }

  async forEntity(restaurantId: string, entityId: string): Promise<AuditLogDto[]> {
    const rows = await this.db
      .select({ log: auditLog, userName: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.restaurantId, restaurantId), eq(auditLog.entityId, entityId)))
      .orderBy(desc(auditLog.at));
    return rows.map(({ log, userName }) => ({
      id: log.id,
      userId: log.userId,
      userName,
      entity: log.entity,
      entityId: log.entityId,
      action: log.action,
      before: log.before,
      after: log.after,
      at: log.at.toISOString(),
    }));
  }
}
