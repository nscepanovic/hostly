import type { CustomerType, TableSuggestion } from '@hostly/shared';

/** The table fields the suggestion rules need. */
export interface SuggestTable {
  id: string;
  areaId: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minSeats: number;
  maxSeats: number;
  rating: number;
}

export interface SuggestGroup {
  id: string;
  name: string;
  tableIds: string[];
}

export interface SuggestOptions {
  customerType?: CustomerType | null;
  areaId?: string | null;
  limit?: number;
  /** Max distance between table edges for an ad hoc join. */
  adjacency?: number;
}

const isVip = (t?: CustomerType | null) => t === 'vip' || t === 'svip';

/** Gap between two axis-aligned table boxes (0 when they touch or overlap). */
export function tableGap(a: SuggestTable, b: SuggestTable): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Ranks tables for a party. `freeTables` must already be filtered to tables that are
 * active and free for the whole window.
 *
 * 1. Single tables with min <= covers <= max: smallest max_seats first; ties go to
 *    the higher rating for VIP/SVIP guests, otherwise the lower rating (keep the
 *    best tables for VIPs).
 * 2. Otherwise predefined join groups whose tables are all free and seat the party.
 * 3. Otherwise ad hoc joins of adjacent free tables in the same area.
 */
export function suggestTables(
  freeTables: SuggestTable[],
  groups: SuggestGroup[],
  covers: number,
  opts: SuggestOptions = {},
): TableSuggestion[] {
  const limit = opts.limit ?? 5;
  const vip = isVip(opts.customerType);
  const inArea = (t: SuggestTable) => !opts.areaId || t.areaId === opts.areaId;
  const byRating = (a: SuggestTable, b: SuggestTable) => (vip ? b.rating - a.rating : a.rating - b.rating);

  const singles = freeTables
    .filter((t) => inArea(t) && t.minSeats <= covers && covers <= t.maxSeats)
    .sort((a, b) => a.maxSeats - b.maxSeats || byRating(a, b) || a.label.localeCompare(b.label, undefined, { numeric: true }))
    .slice(0, limit)
    .map<TableSuggestion>((t) => ({
      kind: 'single',
      tableIds: [t.id],
      labels: [t.label],
      capacity: { min: t.minSeats, max: t.maxSeats },
    }));
  if (singles.length) return singles;

  const freeById = new Map(freeTables.map((t) => [t.id, t]));
  const joined = groups
    .map((g) => ({ g, ts: g.tableIds.map((id) => freeById.get(id)) }))
    .filter((x): x is { g: SuggestGroup; ts: SuggestTable[] } => x.ts.every((t) => !!t && inArea(t)))
    .map(({ g, ts }) => ({ g, ts, min: sum(ts, 'minSeats'), max: sum(ts, 'maxSeats'), rating: avg(ts) }))
    .filter((x) => covers <= x.max)
    .sort((a, b) => a.max - b.max || (vip ? b.rating - a.rating : a.rating - b.rating))
    .slice(0, limit)
    .map<TableSuggestion>((x) => ({
      kind: 'join_group',
      tableIds: x.ts.map((t) => t.id),
      labels: x.ts.map((t) => t.label),
      capacity: { min: x.min, max: x.max },
      joinGroupId: x.g.id,
    }));
  if (joined.length) return joined;

  return adHocJoins(freeTables.filter(inArea), covers, opts.adjacency ?? 60, vip).slice(0, limit);
}

/** Connected sets (2-4 tables) of adjacent free tables that together seat the party. */
function adHocJoins(tables: SuggestTable[], covers: number, adjacency: number, vip: boolean): TableSuggestion[] {
  const neighbours = new Map<string, SuggestTable[]>();
  for (const a of tables) {
    neighbours.set(
      a.id,
      tables.filter((b) => b.id !== a.id && b.areaId === a.areaId && tableGap(a, b) <= adjacency),
    );
  }

  const seen = new Set<string>();
  const found: Array<{ ts: SuggestTable[]; max: number; min: number; rating: number }> = [];
  const MAX_TABLES = 4;

  const grow = (set: SuggestTable[]) => {
    const key = set.map((t) => t.id).sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    const max = sum(set, 'maxSeats');
    if (set.length >= 2 && max >= covers) {
      // Stop growing: a bigger set would only waste seats.
      found.push({ ts: set, max, min: sum(set, 'minSeats'), rating: avg(set) });
      return;
    }
    if (set.length >= MAX_TABLES) return;
    const ids = new Set(set.map((t) => t.id));
    for (const t of set) {
      for (const n of neighbours.get(t.id) ?? []) {
        if (!ids.has(n.id)) grow([...set, n]);
      }
    }
  };
  for (const t of tables) grow([t]);

  return found
    .sort((a, b) => a.max - b.max || a.ts.length - b.ts.length || (vip ? b.rating - a.rating : a.rating - b.rating))
    .map((x) => {
      const ts = [...x.ts].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      return {
        kind: 'ad_hoc' as const,
        tableIds: ts.map((t) => t.id),
        labels: ts.map((t) => t.label),
        capacity: { min: x.min, max: x.max },
      };
    });
}

const sum = (ts: SuggestTable[], k: 'minSeats' | 'maxSeats') => ts.reduce((n, t) => n + t[k], 0);
const avg = (ts: SuggestTable[]) => ts.reduce((n, t) => n + t.rating, 0) / ts.length;
