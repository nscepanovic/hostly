import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link2, Sparkles } from 'lucide-react';
import type { TableSuggestion } from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

export function SuggestionList({
  suggestions,
  onPick,
  selected,
}: {
  suggestions: TableSuggestion[];
  onPick: (s: TableSuggestion) => void;
  selected?: string[];
}) {
  const { t } = useTranslation();
  if (!suggestions.length) return <p className="text-sm text-warn">{t('reservation.noSuggestion')}</p>;
  const key = (ids: string[]) => [...ids].sort().join(',');
  const sel = selected ? key(selected) : '';
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s) => {
        const active = sel === key(s.tableIds);
        return (
          <button
            key={s.tableIds.join()}
            type="button"
            onClick={() => onPick(s)}
            className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left transition active:scale-95 ${
              active ? 'border-accent bg-accent/15' : 'border-border bg-surface-2 hover:border-accent/60'
            }`}
          >
            {s.kind === 'single' ? <Sparkles size={16} className="text-accent" /> : <Link2 size={16} className="text-st-pending" />}
            <span className="font-semibold">{s.labels.join(' + ')}</span>
            <span className="text-xs text-muted">
              {s.capacity.min}–{s.capacity.max}
              {s.kind === 'join_group' && ` · ${t('reservation.joinGroup')}`}
              {s.kind === 'ad_hoc' && ` · ${t('reservation.adHoc')}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Picks tables for a party via the server's suggestion (used for accept / seat waiting). */
export function SuggestionSheet({
  open,
  title,
  covers,
  arrivalAt,
  departureAt,
  customerId,
  onPick,
  onClose,
  noneLabel,
  excludeReservationId,
  current,
}: {
  open: boolean;
  /** The reservation being placed, so its own held tables count as free. */
  excludeReservationId?: string;
  /** Tables already held (e.g. auto-assigned online request), offered first. */
  current?: { tableIds: string[]; labels: string[] };
  title: string;
  covers: number;
  arrivalAt: string;
  departureAt?: string;
  customerId?: string | null;
  onPick: (tableIds: string[]) => void;
  onClose: () => void;
  noneLabel?: string;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['suggest', arrivalAt, departureAt, covers, customerId, excludeReservationId],
    queryFn: () =>
      api.get<TableSuggestion[]>('/reservations/suggest', {
        arrivalAt,
        departureAt,
        covers,
        customerId: customerId ?? undefined,
        excludeReservationId,
      }),
    enabled: open,
  });
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {current && current.tableIds.length > 0 && (
        <Button variant="primary" className="mb-4 w-full" onClick={() => onPick(current.tableIds)}>
          {current.labels.join(' + ')}
        </Button>
      )}
      <div className="mb-2 label">{t('reservation.suggestions')}</div>
      {isLoading ? <p className="text-muted">{t('common.loading')}</p> : <SuggestionList suggestions={data ?? []} onPick={(s) => onPick(s.tableIds)} />}
      {noneLabel && (
        <Button className="mt-4 w-full" onClick={() => onPick([])}>
          {noneLabel}
        </Button>
      )}
    </Modal>
  );
}
