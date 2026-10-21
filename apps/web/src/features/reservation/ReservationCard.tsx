import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Cake, Crown, Globe, Phone, Footprints, UserRound, Ban } from 'lucide-react';
import { PurposeIcon } from './PurposeIcon';
import { phoneCountry, type ReservationDto } from '@hostly/shared';
import { guestName } from '@/lib/day';
import { useRestaurant } from '@/lib/queries';
import { fmtTime } from '@/lib/time';

export const SOURCE_ICON: Record<ReservationDto['source'], ReactNode> = {
  online: <Globe size={15} />,
  phone: <Phone size={15} />,
  walk_in: <Footprints size={15} />,
  staff: <UserRound size={15} />,
};

const STATUS_DOT: Record<ReservationDto['status'], string> = {
  pending: 'bg-st-pending',
  confirmed: 'bg-st-reserved',
  seated: 'bg-st-seated',
  completed: 'bg-st-completed',
  cancelled: 'bg-danger',
  no_show: 'bg-warn',
};

export function flagEmoji(country: string | null) {
  if (!country) return '';
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export function CustomerBadge({ type }: { type: ReservationDto['customerType'] }) {
  const { t } = useTranslation();
  if (!type || type === 'regular') return null;
  const cls = type === 'blacklisted' ? 'bg-danger/20 text-danger' : 'bg-warn/20 text-warn';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 text-[11px] font-bold ${cls}`}>
      {type === 'blacklisted' ? <Ban size={11} /> : <Crown size={11} />}
      {t(`customerType.${type}`)}
    </span>
  );
}

/** Compact reservation row used in the floor-plan panel and priority list. */
export function ReservationCard({
  r,
  tableLabels,
  timezone,
  onOpen,
  action,
  dragHandle,
}: {
  r: ReservationDto;
  tableLabels: string;
  timezone: string;
  onOpen: () => void;
  action?: ReactNode;
  dragHandle?: ReactNode;
}) {
  const { t } = useTranslation();
  const homeLanguage = useRestaurant().data?.defaultLanguage;
  const flag = r.language !== homeLanguage ? flagEmoji(phoneCountry(r.phone)) || r.language.toUpperCase() : '';
  return (
    <div className="flex items-stretch gap-2 rounded-xl border border-border bg-surface-2 p-2">
      {dragHandle}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex w-12 shrink-0 flex-col items-center">
          <span className="text-base font-bold tabular-nums">{fmtTime(r.arrivalAt, timezone)}</span>
          <span className={`mt-1 h-2 w-2 rounded-full ${STATUS_DOT[r.status]}`} title={t(`status.${r.status}`)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{guestName(r)}</span>
            {flag && <span className="text-xs">{flag}</span>}
            <CustomerBadge type={r.customerType} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
            <span className="text-muted">{SOURCE_ICON[r.source]}</span>
            <span title={t(`purpose.${r.purpose}`)}>
              <PurposeIcon purpose={r.purpose} />
            </span>
            {(r.tags.includes('birthday') || r.extras.cake) && <Cake size={14} className="text-pink-400" />}
            {[...r.tags, ...r.dietary].slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-surface-3 px-1.5 text-[11px] text-text">
                {tag}
              </span>
            ))}
            {r.notes && <span className="max-w-40 truncate italic">{r.notes}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-lg font-bold tabular-nums">{r.covers}</span>
          <span className={`max-w-20 truncate text-xs ${tableLabels ? 'text-muted' : 'font-semibold text-warn'}`}>
            {tableLabels || t('topbar.withoutTable')}
          </span>
        </div>
      </button>
      {action}
    </div>
  );
}
