import type { ReactNode } from 'react';

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  /** Shown right-aligned, e.g. the formatted amount. */
  valueText: string;
  detail?: string;
  /** Hover text for the row. */
  title?: string;
}

/**
 * Ranked horizontal bars (best sellers, payment methods): one hue for
 * magnitude, label and value as text so the list reads like a table.
 */
export function BarList({ title, rows, empty, action }: { title: string; rows: BarListRow[]; empty: string; action?: ReactNode }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <figure className="card min-w-0 p-4">
      <figcaption className="mb-3 flex items-center justify-between gap-2">
        <span className="font-semibold">{title}</span>
        {action}
      </figcaption>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="text-sm" title={r.title}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{r.valueText}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-surface-2">
                  <div className="h-2 rounded-full" style={{ width: `${max > 0 ? Math.max(2, (Math.max(0, r.value) / max) * 100) : 0}%`, background: 'var(--color-chart)' }} />
                </div>
                {r.detail && <span className="w-14 shrink-0 text-right text-xs text-muted tabular-nums">{r.detail}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
