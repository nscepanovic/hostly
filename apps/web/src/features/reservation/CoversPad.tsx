import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

const QUICK = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

/** Big +/- stepper with a quick-pick pad (the competitor's numeric pad). */
export function CoversPad({
  value,
  onChange,
  max,
  autoOpen = false,
}: {
  value: number | null;
  onChange: (v: number) => void;
  max: number;
  /** Opens the pad when it becomes true (after the time is picked on a new reservation). */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);
  const v = value ?? 0;
  return (
    <div className="relative">
      <div className="flex h-11 items-stretch overflow-hidden rounded-lg border border-border bg-surface-2">
        <button type="button" className="w-11 shrink-0 hover:bg-surface-3" onClick={() => onChange(Math.max(1, v - 1))} aria-label="-">
          <Minus size={18} className="mx-auto" />
        </button>
        <button type="button" className="flex-1 text-lg font-bold tabular-nums" onClick={() => setOpen((o) => !o)}>
          {value ?? '–'}
        </button>
        <button type="button" className="w-11 shrink-0 hover:bg-surface-3" onClick={() => onChange(Math.min(max, v + 1))} aria-label="+">
          <Plus size={18} className="mx-auto" />
        </button>
      </div>
      {open && (
        <div className="absolute right-0 z-20 mt-1 grid w-60 grid-cols-5 gap-1 rounded-xl border border-border bg-surface p-2 shadow-2xl">
          {QUICK.filter((n) => n <= max).map((n) => (
            <button
              key={n}
              type="button"
              className={`h-11 rounded-lg text-lg font-semibold ${n === value ? 'bg-accent text-accent-ink' : 'bg-surface-2 hover:bg-surface-3'}`}
              onClick={() => {
                onChange(n);
                setOpen(false);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
