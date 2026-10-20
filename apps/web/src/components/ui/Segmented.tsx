export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: Array<{ value: T; label: React.ReactNode; badge?: number }>;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-border bg-surface-2 p-1 ${className}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition ${
            o.value === value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text'
          }`}
        >
          {o.label}
          {o.badge !== undefined && o.badge > 0 && (
            <span
              className={`rounded-full px-1.5 text-xs leading-5 ${o.value === value ? 'bg-accent-ink/20' : 'bg-surface-3 text-text'}`}
            >
              {o.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
