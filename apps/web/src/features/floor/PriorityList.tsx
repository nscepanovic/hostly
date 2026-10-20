import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import type { ReservationDto, TableDto } from '@hostly/shared';
import { confirmDialog } from '@/components/ui/Confirm';
import { guestName } from '@/lib/day';
import { fmtDateTime } from '@/lib/time';
import { luxonLocale } from '@/i18n';
import { useUi } from '@/store/ui';
import { ReservationCard } from '../reservation/ReservationCard';
import { SuggestionSheet } from '../reservation/SuggestionSheet';
import { useReservationActions } from '../reservation/actions';

export function PriorityList({ items, tables, timezone }: { items: ReservationDto[]; tables: TableDto[]; timezone: string }) {
  const { t, i18n } = useTranslation();
  const openReservation = useUi((s) => s.openReservation);
  const { accept, decline } = useReservationActions();
  const [accepting, setAccepting] = useState<ReservationDto | null>(null);
  const labelOf = new Map(tables.map((tb) => [tb.id, tb.label]));

  if (!items.length) return <p className="p-6 text-center text-muted">{t('priority.empty')}</p>;

  const onDecline = async (r: ReservationDto) => {
    const { ok, text } = await confirmDialog(`${t('actions.decline')}: ${guestName(r)}?`, { danger: true, input: t('actions.declineReason') });
    if (ok) decline.mutate({ id: r.id, reason: text || undefined });
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((r) => (
        <div key={r.id}>
          <div className="mb-1 px-1 text-xs text-muted">{fmtDateTime(r.arrivalAt, timezone, luxonLocale(i18n.language))}</div>
          <ReservationCard
            r={r}
            tableLabels={r.tableIds.map((id) => labelOf.get(id)).join(', ')}
            timezone={timezone}
            onOpen={() => openReservation(r.id)}
            action={
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setAccepting(r)}
                  className="flex h-10 w-12 items-center justify-center rounded-lg bg-ok text-white"
                  aria-label={t('actions.accept')}
                >
                  <Check size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => onDecline(r)}
                  className="flex h-10 w-12 items-center justify-center rounded-lg bg-danger text-white"
                  aria-label={t('actions.decline')}
                >
                  <X size={20} />
                </button>
              </div>
            }
          />
        </div>
      ))}
      {accepting && (
        <SuggestionSheet
          open
          title={`${t('actions.accept')}: ${guestName(accepting)} (${accepting.covers})`}
          covers={accepting.covers}
          arrivalAt={accepting.arrivalAt}
          departureAt={accepting.departureAt}
          customerId={accepting.customerId}
          noneLabel={`${t('actions.accept')} — ${t('topbar.withoutTable')}`}
          onClose={() => setAccepting(null)}
          onPick={(tableIds) => {
            accept.mutate({ id: accepting.id, tableIds });
            setAccepting(null);
          }}
        />
      )}
    </div>
  );
}
