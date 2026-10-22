import { useMemo, type ReactNode } from 'react';
import { usePanZoom } from './usePanZoom';
import { ZoomControls } from './ZoomControls';
import { useTranslation } from 'react-i18next';
import type { ReservationDto, TableDto } from '@hostly/shared';
import { guestName } from '@/lib/day';
import { fmtTime } from '@/lib/time';
import { STATE_FILL, type TableStatus } from '@/lib/tableState';
import { useElementSize } from '@/lib/useElementSize';
import { TableShape, tablesBounds } from './TableShape';

export function FloorCanvas({
  tables,
  statuses,
  reservations,
  timezone,
  resetKey,
  onTableTap,
  highlightIds,
  dimIds,
  toolbar,
  header,
}: {
  tables: TableDto[];
  statuses: Map<string, TableStatus>;
  reservations: ReservationDto[];
  timezone: string;
  /** The view re-centres when this changes (e.g. the area shown). */
  resetKey: string;
  onTableTap: (table: TableDto) => void;
  highlightIds?: Set<string>;
  dimIds?: Set<string>;
  toolbar?: ReactNode;
  /** Left side of the bar above the plan (e.g. the area picker). */
  header?: ReactNode;
}) {
  const { t } = useTranslation();
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  // Extra room at the bottom for the "coming next" chips under the lowest tables.
  const bounds = useMemo(() => {
    const b = tablesBounds(tables, 50);
    return { ...b, h: b.h + CHIP_ROOM };
  }, [tables]);
  const byId = useMemo(() => new Map(tables.map((tb) => [tb.id, tb])), [tables]);

  // Lines between tables of the same reservation (joined tables).
  const joins = useMemo(() => {
    const lines: Array<{ key: string; x1: number; y1: number; x2: number; y2: number; seated: boolean }> = [];
    for (const r of reservations) {
      if (r.tableIds.length < 2 || r.status === 'cancelled' || r.status === 'no_show' || r.status === 'completed') continue;
      const ts = r.tableIds.map((id) => byId.get(id)).filter(Boolean) as TableDto[];
      for (let i = 1; i < ts.length; i++) {
        const a = ts[i - 1];
        const b = ts[i];
        lines.push({
          key: `${r.id}-${i}`,
          x1: a.x + a.w / 2,
          y1: a.y + a.h / 2,
          x2: b.x + b.w / 2,
          y2: b.y + b.h / 2,
          seated: r.status === 'seated',
        });
      }
    }
    return lines;
  }, [reservations, byId]);

  const view = usePanZoom(containerRef, size, bounds, resetKey);
  const vb = view.viewBox;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-2 pt-2">
        <div className="min-w-0 flex-1">{header}</div>
        <ZoomControls view={view}>{toolbar}</ZoomControls>
      </div>
      {/* Drag to pan, pinch or wheel to zoom (see usePanZoom). */}
      <div ref={containerRef} className="min-h-0 w-full flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing">
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="block h-full w-full select-none">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--color-border)" />
            </pattern>
          </defs>
          {/* The dotted floor fills whatever is visible, however far out you zoom. */}
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#grid)" />
          {joins.map((l) => (
            <line
              key={l.key}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.seated ? 'var(--color-st-seated)' : 'var(--color-st-reserved)'}
              strokeWidth={6}
              strokeDasharray="10 8"
              strokeLinecap="round"
              opacity={0.8}
            />
          ))}
          {tables.map((tb) => {
            const st = statuses.get(tb.id);
            const state = st?.state ?? 'free';
            const r = st?.reservation;
            const highlighted = highlightIds?.has(tb.id);
            const dimmed = dimIds?.has(tb.id);
            const small = Math.min(tb.w, tb.h) < 70;
            return (
              <g
                key={tb.id}
                data-table-id={tb.id}
                transform={`translate(${tb.x} ${tb.y})`}
                onClick={() => onTableTap(tb)}
                className="cursor-pointer"
                opacity={dimmed ? 0.35 : 1}
              >
                <TableShape
                  table={tb}
                  fill={STATE_FILL[state]}
                  stroke={highlighted ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={highlighted ? 5 : 2}
                  className={state === 'attention' ? 'attention' : undefined}
                >
                  <text x={tb.w / 2} y={-22} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-muted)">
                    {tb.minSeats}-{tb.maxSeats}
                  </text>
                  {!r && st?.freeUntil && (
                    <text x={tb.w / 2} y={tb.h / 2 + (small ? 12 : 16)} textAnchor="middle" fontSize={small ? 11 : 12} fill="var(--color-muted)">
                      {t('floor.until', { time: fmtTime(st.freeUntil, timezone) })}
                    </text>
                  )}
                  <text
                    x={tb.w / 2}
                    y={r ? tb.h / 2 - (small ? 8 : 14) : st?.freeUntil ? tb.h / 2 - (small ? 2 : 4) : tb.h / 2 + 6}
                    textAnchor="middle"
                    fontSize={small ? 15 : 18}
                    fontWeight={700}
                    fill={state === 'free' ? 'var(--color-text)' : '#fff'}
                  >
                    {tb.label}
                  </text>
                  {r && (
                    <>
                      <text x={tb.w / 2} y={tb.h / 2 + (small ? 8 : 6)} textAnchor="middle" fontSize={small ? 11 : 13} fill="#fff" fontWeight={600}>
                        {truncate(r.lastName ?? r.firstName ?? guestName(r), small ? 8 : Math.floor(tb.w / 9))}
                      </text>
                      <text x={tb.w / 2} y={tb.h / 2 + (small ? 22 : 24)} textAnchor="middle" fontSize={small ? 11 : 13} fill="#fff" opacity={0.9}>
                        {fmtTime(r.arrivalAt, timezone)} · {r.covers}
                      </text>
                    </>
                  )}
                  {st && st.upcoming.length > 0 && <ComingUp items={st.upcoming} tableW={tb.w} tableH={tb.h} timezone={timezone} />}
                </TableShape>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

const CHIP_ROOM = 64;
const CHIP_W = 70;
const CHIP_H = 17;
const MAX_CHIPS = 3;
const CHIP_STROKE: Partial<Record<ReservationDto['status'], string>> = {
  pending: 'var(--color-st-pending)',
  confirmed: 'var(--color-st-reserved)',
};

/** The next 2-3 bookings of a table, as small time chips under it ("19:00 · 4"). */
function ComingUp({ items, tableW, tableH, timezone }: { items: ReservationDto[]; tableW: number; tableH: number; timezone: string }) {
  const shown = items.slice(0, MAX_CHIPS);
  const more = items.length - shown.length;
  // Below the chairs (14px chair + 4px gap).
  const top = tableH + 24;
  return (
    <g pointerEvents="none">
      {shown.map((r, i) => (
        <g key={r.id} transform={`translate(${tableW / 2 - CHIP_W / 2} ${top + i * (CHIP_H + 3)})`}>
          <rect width={CHIP_W} height={CHIP_H} rx={CHIP_H / 2} fill="var(--color-surface)" stroke={CHIP_STROKE[r.status] ?? 'var(--color-border)'} strokeWidth={1.5} />
          <text x={CHIP_W / 2} y={12.5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-text)">
            {fmtTime(r.arrivalAt, timezone)} · {r.covers}
            {more > 0 && i === shown.length - 1 ? `  +${more}` : ''}
          </text>
        </g>
      ))}
    </g>
  );
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(n - 1, 1))}…` : s);
