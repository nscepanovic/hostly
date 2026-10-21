import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Mail, Phone } from 'lucide-react';
import { formatPhone, type CustomerDto } from '@hostly/shared';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/time';
import { CustomerBadge } from './ReservationCard';

/** Form inputs that offer suggestions; both name inputs search names. */
export type GuestInput = 'phone' | 'lastName' | 'firstName' | 'email';
type Field = 'name' | 'phone' | 'email';

const FIELD: Record<GuestInput, Field> = { phone: 'phone', lastName: 'name', firstName: 'name', email: 'email' };

/** Same thresholds as the API's blind-index prefixes. */
function searchable(field: Field, q: string) {
  if (field === 'phone') return q.replace(/\D/g, '').length >= 3;
  if (field === 'email') return q.trim().length >= 3;
  return q.split(/\s+/).some((w) => w.length >= 2);
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/**
 * As-you-type guest suggestions for the reservation form. Attach `inputProps(name)`
 * to each guest input and render `dropdown` inside their positioned container;
 * picking calls `onPick`.
 */
export function useGuestSuggest({
  values,
  enabled,
  onPick,
}: {
  values: Record<GuestInput, string>;
  enabled: boolean;
  onPick: (c: CustomerDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<GuestInput | null>(null);
  // Only after typing in the focused input, so tabbing through a filled form stays quiet.
  const [typed, setTyped] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const anchor = useRef<HTMLInputElement | null>(null);
  const listId = useRef(`guest-suggest-${Math.random().toString(36).slice(2)}`).current;

  const field = active ? FIELD[active] : null;
  // Surname and first name narrow each other ("Pe" + "Marko").
  const raw = !active ? '' : field === 'name' ? `${values.lastName} ${values.firstName}`.trim() : values[active];
  const query = useDebounced(raw, 200);
  const ready = enabled && typed && !!field && searchable(field, query);

  const result = useQuery({
    queryKey: ['guest-suggest', field, query],
    queryFn: () => api.get<CustomerDto[]>('/customers/suggest', { field: field!, q: query }),
    enabled: ready,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const items = ready ? (result.data ?? []) : [];
  const open = items.length > 0;

  useEffect(() => setHighlight(0), [query, field]);

  const pick = (c: CustomerDto) => {
    setTyped(false);
    onPick(c);
  };

  const inputProps = (name: GuestInput) => ({
    autoComplete: 'off',
    role: 'combobox',
    'aria-expanded': open && active === name,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
    onFocus: (e: FocusEvent<HTMLInputElement>) => {
      anchor.current = e.currentTarget;
      setActive(name);
      setTyped(false);
    },
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      // Picking keeps focus (pointerdown is prevented), so a blur means the user left.
      if (e.relatedTarget?.closest(`#${listId}`)) return;
      setActive((a) => (a === name ? null : a));
    },
    onInput: () => setTyped(true),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pick(items[highlight] ?? items[0]);
      } else if (e.key === 'Escape') {
        // Close the list, not the whole modal.
        e.preventDefault();
        e.stopPropagation();
        setTyped(false);
      }
    },
  });

  const dropdown = open ? (
    <div
      id={listId}
      role="listbox"
      aria-label={t('reservation.guestSuggestions')}
      // Right under the active input (the fields wrap on phones), across the whole guest row.
      style={{ top: anchor.current ? anchor.current.offsetTop + anchor.current.offsetHeight + 4 : '100%' }}
      className="absolute inset-x-0 z-20 max-h-80 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl"
    >
      <div className="label px-3 pt-1">{t('reservation.guestSuggestions')}</div>
      {items.map((c, i) => (
        <button
          key={c.id}
          type="button"
          role="option"
          aria-selected={i === highlight}
          onPointerDown={(e) => e.preventDefault()}
          onPointerEnter={() => setHighlight(i)}
          onClick={() => pick(c)}
          className={`flex w-full min-h-14 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left ${i === highlight ? 'bg-surface-2' : ''}`}
        >
          <span className="flex w-full items-center gap-2">
            <span className="truncate font-semibold">{[c.lastName, c.firstName].filter(Boolean).join(' ') || '—'}</span>
            <CustomerBadge type={c.type} />
            <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">
              {t('reservation.visits', { count: c.stats.visits })}
              {c.stats.lastVisitAt && ` · ${fmtDate(c.stats.lastVisitAt, i18n.language)}`}
            </span>
          </span>
          <span className="flex w-full flex-wrap gap-x-3 text-sm text-muted">
            {c.phone && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone size={13} />
                {formatPhone(c.phone)}
              </span>
            )}
            {c.email && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Mail size={13} />
                <span className="truncate">{c.email}</span>
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  return { inputProps, dropdown };
}
