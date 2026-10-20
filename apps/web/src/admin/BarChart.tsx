import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import type { DailyPoint } from '@hostly/shared';
import { useElementSize } from '@/lib/useElementSize';
import { luxonLocale } from '@/i18n';

const H = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 36 };

/** Whole-number gridline step (1, 2 or 5 x 10^n) giving at most 5 steps, and the axis max it implies. */
export function niceScale(v: number): { max: number; step: number } {
  if (v <= 4) return { max: 4, step: 1 };
  const pow = 10 ** Math.floor(Math.log10(v / 5));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => Math.ceil(v / s) <= 5)!;
  return { max: Math.ceil(v / step) * step, step };
}

/**
 * Daily reservations as a single-series bar chart. One hue (no legend: the
 * title names it), thin bars with 2px gaps and 4px rounded tops on the
 * baseline, recessive grid, per-bar hover/focus tooltip, and a table view.
 */
export function BarChart({ data, title }: { data: DailyPoint[]; title: string }) {
  const { t, i18n } = useTranslation();
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const locale = luxonLocale(i18n.language);
  const { max, step } = useMemo(() => niceScale(Math.max(0, ...data.map((d) => d.reservations))), [data]);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const slot = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, slot - 2);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const fmtDay = (d: string, f: string) => DateTime.fromISO(d).setLocale(locale).toFormat(f);
  const hovered = hover !== null ? data[hover] : null;

  return (
    <figure className="card p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        <button type="button" className="text-sm font-medium text-accent" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('admin.showChart') : t('admin.showTable')}
        </button>
      </figcaption>
      {/* The measured wrapper stays mounted so the chart re-sizes after toggling the table. */}
      <div ref={ref}>
      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="sticky top-0 bg-surface text-xs text-muted uppercase">
              <tr>
                <th className="py-1 text-left">{t('admin.date')}</th>
                <th className="py-1 text-right">{t('admin.reservations')}</th>
                <th className="py-1 text-right">{t('admin.online')}</th>
                <th className="py-1 text-right">{t('admin.covers')}</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-border/50">
                  <td className="py-1">{fmtDay(d.date, 'ccc dd.LL.')}</td>
                  <td className="py-1 text-right">{d.reservations}</td>
                  <td className="py-1 text-right">{d.online}</td>
                  <td className="py-1 text-right">{d.covers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onPointerLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={H} role="img" aria-label={t('admin.chartAria')} className="block">
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth={1} opacity={v === 0 ? 1 : 0.5} />
                  <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                    {v}
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const x = PAD.left + i * slot + (slot - barW) / 2;
                const top = y(d.reservations);
                const h = PAD.top + innerH - top;
                const r = Math.min(4, barW / 2, h);
                return (
                  <g key={d.date}>
                    {h > 0 && (
                      // Rounded top, square on the baseline.
                      <path
                        d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                        fill="var(--color-chart)"
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    )}
                    {/* Hit target: the whole column, bigger than the bar. */}
                    <rect
                      x={PAD.left + i * slot}
                      y={PAD.top}
                      width={slot}
                      height={innerH}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`${fmtDay(d.date, 'dd.LL.')}: ${d.reservations}`}
                      onPointerEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                    />
                    {/* Weekly ticks counted back from today, so the latest day is always labelled. */}
                    {(data.length - 1 - i) % 7 === 0 && (
                      <text x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                        {fmtDay(d.date, 'dd.LL.')}
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
              <div className="font-semibold">{fmtDay(hovered.date, 'cccc dd.LL.yyyy')}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--color-chart)' }} />
                {t('admin.reservations')}: <b className="tabular-nums">{hovered.reservations}</b>
              </div>
              <div className="text-muted">
                {t('admin.online')}: <span className="tabular-nums">{hovered.online}</span> · {t('admin.covers')}:{' '}
                <span className="tabular-nums">{hovered.covers}</span>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </figure>
  );
}
