import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { niceScale } from '@/admin/BarChart';
import { useElementSize } from '@/lib/useElementSize';

const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 52 };

export interface Column {
  key: string;
  /** Short x-axis text; shown when `labelled`. */
  axisLabel: string;
  labelled: boolean;
  /** Tooltip / table heading, e.g. the full date. */
  title: string;
  value: number;
  /** Extra tooltip / table text, e.g. "12 receipts". */
  detail?: string;
}

/**
 * Single-series column chart (one validated hue, no legend: the title names
 * it): thin columns with 2px gaps and 4px rounded tops on the baseline,
 * recessive grid, hover/focus tooltip and a table view.
 */
export function ColumnChart({
  title,
  columns,
  valueLabel,
  format,
  formatTick,
}: {
  title: string;
  columns: Column[];
  valueLabel: string;
  format: (v: number) => string;
  formatTick: (v: number) => string;
}) {
  const { t } = useTranslation();
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const { max, step } = useMemo(() => niceScale(Math.max(0, ...columns.map((c) => c.value))), [columns]);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const slot = columns.length ? innerW / columns.length : 0;
  const barW = Math.max(2, Math.min(slot - 2, 48));
  const y = (v: number) => PAD.top + innerH - (Math.max(0, v) / max) * innerH;
  const hovered = hover !== null ? columns[hover] : null;

  return (
    <figure className="card min-w-0 p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <button type="button" className="text-sm font-medium text-accent" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('admin.showChart') : t('admin.showTable')}
        </button>
      </figcaption>
      <div ref={ref}>
        {asTable ? (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {columns.map((c) => (
                  <tr key={c.key} className="border-t border-border/50">
                    <td className="py-1">{c.title}</td>
                    <td className="py-1 text-right">{format(c.value)}</td>
                    <td className="py-1 pl-3 text-right text-muted">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative" onPointerLeave={() => setHover(null)}>
            {width > 0 && (
              <svg width={width} height={H} role="img" aria-label={title} className="block">
                {ticks.map((v) => (
                  <g key={v}>
                    <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth={1} opacity={v === 0 ? 1 : 0.5} />
                    <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                      {formatTick(v)}
                    </text>
                  </g>
                ))}
                {columns.map((c, i) => {
                  const x = PAD.left + i * slot + (slot - barW) / 2;
                  const top = y(c.value);
                  const h = PAD.top + innerH - top;
                  const r = Math.min(4, barW / 2, h);
                  return (
                    <g key={c.key}>
                      {h > 0 && (
                        <path
                          d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                          fill="var(--color-chart)"
                          opacity={hover === null || hover === i ? 1 : 0.55}
                        />
                      )}
                      <rect
                        x={PAD.left + i * slot}
                        y={PAD.top}
                        width={slot}
                        height={innerH}
                        fill="transparent"
                        tabIndex={0}
                        aria-label={`${c.title}: ${format(c.value)}`}
                        onPointerEnter={() => setHover(i)}
                        onFocus={() => setHover(i)}
                        onBlur={() => setHover(null)}
                      />
                      {c.labelled && (
                        <text x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                          {c.axisLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
            {hovered && hover !== null && (
              <div
                className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-xl"
                style={{ left: Math.min(Math.max(PAD.left + hover * slot + slot / 2, 80), width - 80), top: 0 }}
              >
                <div className="font-semibold">{hovered.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--color-chart)' }} />
                  {valueLabel}: <b className="tabular-nums">{format(hovered.value)}</b>
                </div>
                {hovered.detail && <div className="text-muted">{hovered.detail}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
