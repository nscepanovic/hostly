import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReservationDto, TableDto } from '@hostly/shared';
import { guestName } from '@/lib/day';
import { fmtTime } from '@/lib/time';
import { STATE_FILL, type TableStatus } from '@/lib/tableState';
import { useElementSize } from '@/lib/useElementSize';
import { IconButton } from '../ui/Button';
import { TableShape, tablesBounds } from './TableShape';

export function FloorCanvas({
  tables,
  statuses,
  reservations,
  timezone,
  zoom,
  onZoom,
  onTableTap,
  highlightIds,
  dimIds,
  toolbar,
}: {
  tables: TableDto[];
  statuses: Map<string, TableStatus>;
  reservations: ReservationDto[];
  timezone: string;
  zoom: number;
  onZoom: (z: number) => void;
  onTableTap: (table: TableDto) => void;
  highlightIds?: Set<string>;
  dimIds?: Set<string>;
  toolbar?: ReactNode;
}) {
  const { t } = useTranslation();
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const bounds = useMemo(() => tablesBounds(tables, 50), [tables]);
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

  const fitted = zoom === 1;
  const svgStyle = fitted
    ? { width: '100%', height: '100%' }
    : { width: Math.max(size.width, 1) * zoom, height: Math.max(size.height, 1) * zoom };

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto"
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          onZoom(Math.min(3, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
        }}
      >
        <svg
          viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
          preserveAspectRatio="xMidYMid meet"
          style={svgStyle}
          className="block touch-manipulation select-none"
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="var(--color-border)" />
            </pattern>
          </defs>
          <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="url(#grid)" />
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
                  <text
                    x={tb.w / 2}
                    y={r ? tb.h / 2 - (small ? 8 : 14) : tb.h / 2 + 6}
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
                  {st && st.upcoming.length > 0 && (
                    <g transform={`translate(${tb.w - 6} -6)`}>
                      <circle r={11} fill="var(--color-surface)" stroke="var(--color-st-reserved)" strokeWidth={2} />
                      <text textAnchor="middle" y={4.5} fontSize={12} fontWeight={700} fill="var(--color-text)">
                        +{st.upcoming.length}
                      </text>
                    </g>
                  )}
                </TableShape>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-xl border border-border bg-surface/90 p-1 backdrop-blur">
        {toolbar}
        <IconButton label={t('floor.zoomOut')} onClick={() => onZoom(Math.max(1, zoom / 1.3))} disabled={zoom <= 1}>
          <ZoomOut size={20} />
        </IconButton>
        <IconButton label={t('floor.zoomIn')} onClick={() => onZoom(Math.min(3, zoom * 1.3))}>
          <ZoomIn size={20} />
        </IconButton>
        <IconButton label={t('floor.fit')} onClick={() => onZoom(1)}>
          <Maximize size={20} />
        </IconButton>
      </div>
    </div>
  );
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(n - 1, 1))}…` : s);
