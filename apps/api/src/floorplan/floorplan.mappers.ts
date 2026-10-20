import type { AreaDto, JoinGroupDto, TableDto } from '@hostly/shared';
import type { AreaRow, JoinGroupRow, TableRow } from '../db/schema';

export const toAreaDto = (a: AreaRow): AreaDto => ({ id: a.id, name: a.name, sort: a.sort });

export const toTableDto = (t: TableRow): TableDto => ({
  id: t.id,
  areaId: t.areaId,
  label: t.label,
  shape: t.shape,
  x: t.x,
  y: t.y,
  w: t.w,
  h: t.h,
  rotation: t.rotation,
  minSeats: t.minSeats,
  maxSeats: t.maxSeats,
  rating: t.rating,
  active: t.active,
});

export const toJoinGroupDto = (g: JoinGroupRow): JoinGroupDto => ({ id: g.id, name: g.name, tableIds: g.tableIds });
