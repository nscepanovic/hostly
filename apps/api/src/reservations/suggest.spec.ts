import { suggestTables, tableGap, type SuggestTable } from './suggest';

let n = 0;
const table = (label: string, min: number, max: number, rating: number, pos: Partial<SuggestTable> = {}): SuggestTable => ({
  id: `t${++n}`,
  areaId: 'a1',
  label,
  x: 0,
  y: 0,
  w: 80,
  h: 80,
  minSeats: min,
  maxSeats: max,
  rating,
  ...pos,
});

describe('suggestTables', () => {
  const t2low = table('br 1', 1, 2, 3, { x: 0 });
  const t2high = table('br 2', 1, 2, 9, { x: 500 });
  const t4 = table('br 3', 2, 4, 5, { x: 1000 });
  const t8 = table('br 4', 6, 8, 6, { x: 1500 });

  it('picks the smallest table that fits', () => {
    const s = suggestTables([t8, t4, t2low, t2high], [], 3);
    expect(s[0]).toMatchObject({ kind: 'single', labels: ['br 3'] });
    expect(s.map((x) => x.labels[0])).toEqual(['br 3']);
  });

  it('respects min seats (no 2-top on an 8-top)', () => {
    const s = suggestTables([t8, t4], [], 2);
    expect(s.map((x) => x.labels[0])).toEqual(['br 3']);
  });

  it('gives regular guests the lower-rated table and VIPs the higher one', () => {
    expect(suggestTables([t2low, t2high], [], 2)[0].labels).toEqual(['br 1']);
    expect(suggestTables([t2low, t2high], [], 2, { customerType: 'vip' })[0].labels).toEqual(['br 2']);
    expect(suggestTables([t2low, t2high], [], 2, { customerType: 'svip' })[0].labels).toEqual(['br 2']);
  });

  it('falls back to predefined join groups when no single table fits', () => {
    const a = table('br 5', 2, 4, 5);
    const b = table('br 6', 2, 4, 5, { x: 2000 });
    const s = suggestTables([a, b, t2low], [{ id: 'g1', name: 'br 5 + br 6', tableIds: [a.id, b.id] }], 7);
    expect(s[0]).toMatchObject({ kind: 'join_group', joinGroupId: 'g1', capacity: { min: 4, max: 8 } });
  });

  it('ignores join groups with a busy table', () => {
    const a = table('br 5', 2, 4, 5);
    const busy = table('br 6', 2, 4, 5);
    const s = suggestTables([a], [{ id: 'g1', name: 'x', tableIds: [a.id, busy.id] }], 7);
    expect(s.find((x) => x.kind === 'join_group')).toBeUndefined();
  });

  it('proposes adjacent ad hoc joins as the last resort', () => {
    const a = table('br 7', 2, 4, 5, { x: 0, y: 0 });
    const b = table('br 8', 2, 4, 5, { x: 100, y: 0 });
    const far = table('br 9', 2, 4, 5, { x: 900, y: 900 });
    const s = suggestTables([a, b, far], [], 7);
    expect(s[0]).toMatchObject({ kind: 'ad_hoc', labels: ['br 7', 'br 8'], capacity: { max: 8 } });
    expect(s.every((x) => !x.labels.includes('br 9'))).toBe(true);
  });

  it('returns nothing when the room cannot seat the party', () => {
    expect(suggestTables([t2low], [], 12)).toEqual([]);
  });

  it('filters by area', () => {
    const other = table('br 10', 1, 2, 1, { areaId: 'a2' });
    expect(suggestTables([other, t2high], [], 2, { areaId: 'a1' })[0].labels).toEqual(['br 2']);
  });
});

describe('tableGap', () => {
  it('is zero for touching tables and euclidean otherwise', () => {
    const a = table('a', 1, 2, 1, { x: 0, y: 0 });
    expect(tableGap(a, table('b', 1, 2, 1, { x: 80, y: 0 }))).toBe(0);
    expect(tableGap(a, table('c', 1, 2, 1, { x: 110, y: 120 }))).toBeCloseTo(50);
  });
});
