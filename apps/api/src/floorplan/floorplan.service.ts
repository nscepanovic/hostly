import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AreaInput, FloorPlanSaveInput, JoinGroupInput } from '@hostly/shared';
import { InjectDb, type Db } from '../db/db.module';
import { areas, reservationTables, tableJoinGroups, tables } from '../db/schema';

@Injectable()
export class FloorPlanService {
  constructor(@InjectDb() private readonly db: Db) {}

  listAreas(restaurantId: string) {
    return this.db.select().from(areas).where(eq(areas.restaurantId, restaurantId)).orderBy(asc(areas.sort), asc(areas.name));
  }

  async createArea(restaurantId: string, input: AreaInput) {
    const [row] = await this.db.insert(areas).values({ restaurantId, ...input }).returning();
    return row;
  }

  async updateArea(restaurantId: string, id: string, input: AreaInput) {
    const [row] = await this.db
      .update(areas)
      .set(input)
      .where(and(eq(areas.id, id), eq(areas.restaurantId, restaurantId)))
      .returning();
    if (!row) throw new NotFoundException();
    return row;
  }

  async deleteArea(restaurantId: string, id: string) {
    const all = await this.listAreas(restaurantId);
    if (all.length <= 1) throw new BadRequestException('A restaurant needs at least one area');
    const [row] = await this.db
      .delete(areas)
      .where(and(eq(areas.id, id), eq(areas.restaurantId, restaurantId)))
      .returning();
    if (!row) throw new NotFoundException();
  }

  listTables(restaurantId: string) {
    return this.db.select().from(tables).where(eq(tables.restaurantId, restaurantId)).orderBy(asc(tables.label));
  }

  /**
   * Saves one area's layout. Tables with ids are updated, without ids inserted,
   * and `deletedTableIds` are deactivated when they have history, deleted otherwise.
   */
  async saveFloorPlan(restaurantId: string, input: FloorPlanSaveInput) {
    return this.db.transaction(async (tx) => {
      const [area] = await tx.select().from(areas).where(and(eq(areas.id, input.areaId), eq(areas.restaurantId, restaurantId)));
      if (!area) throw new NotFoundException('Area not found');

      const owned = await tx.select({ id: tables.id }).from(tables).where(eq(tables.restaurantId, restaurantId));
      const ownedIds = new Set(owned.map((t) => t.id));

      for (const t of input.tables) {
        const { id, ...values } = t;
        if (values.areaId !== input.areaId) throw new BadRequestException('Table belongs to another area');
        if (id) {
          if (!ownedIds.has(id)) throw new NotFoundException(`Table ${id} not found`);
          await tx.update(tables).set(values).where(eq(tables.id, id));
        } else {
          await tx.insert(tables).values({ ...values, restaurantId });
        }
      }

      const toDelete = input.deletedTableIds.filter((id) => ownedIds.has(id));
      if (toDelete.length) {
        // Tables with reservation history are only hidden so past visits keep their table.
        const referenced = await tx
          .selectDistinct({ id: reservationTables.tableId })
          .from(reservationTables)
          .where(inArray(reservationTables.tableId, toDelete));
        const keep = new Set(referenced.map((r) => r.id));
        const hide = toDelete.filter((id) => keep.has(id));
        const remove = toDelete.filter((id) => !keep.has(id));
        if (hide.length) await tx.update(tables).set({ active: false }).where(inArray(tables.id, hide));
        if (remove.length) await tx.delete(tables).where(inArray(tables.id, remove));
      }

      return tx.select().from(tables).where(eq(tables.restaurantId, restaurantId)).orderBy(asc(tables.label));
    });
  }

  listJoinGroups(restaurantId: string) {
    return this.db.select().from(tableJoinGroups).where(eq(tableJoinGroups.restaurantId, restaurantId)).orderBy(asc(tableJoinGroups.name));
  }

  private async assertTablesOwned(restaurantId: string, ids: string[]) {
    const rows = await this.db
      .select({ id: tables.id })
      .from(tables)
      .where(and(eq(tables.restaurantId, restaurantId), inArray(tables.id, ids)));
    if (rows.length !== new Set(ids).size) throw new BadRequestException('Unknown table in group');
  }

  async createJoinGroup(restaurantId: string, input: JoinGroupInput) {
    await this.assertTablesOwned(restaurantId, input.tableIds);
    const [row] = await this.db.insert(tableJoinGroups).values({ restaurantId, ...input }).returning();
    return row;
  }

  async updateJoinGroup(restaurantId: string, id: string, input: JoinGroupInput) {
    await this.assertTablesOwned(restaurantId, input.tableIds);
    const [row] = await this.db
      .update(tableJoinGroups)
      .set(input)
      .where(and(eq(tableJoinGroups.id, id), eq(tableJoinGroups.restaurantId, restaurantId)))
      .returning();
    if (!row) throw new NotFoundException();
    return row;
  }

  async deleteJoinGroup(restaurantId: string, id: string) {
    const [row] = await this.db
      .delete(tableJoinGroups)
      .where(and(eq(tableJoinGroups.id, id), eq(tableJoinGroups.restaurantId, restaurantId)))
      .returning();
    if (!row) throw new NotFoundException();
  }
}
