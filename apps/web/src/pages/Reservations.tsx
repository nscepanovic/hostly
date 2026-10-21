import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { PurposeIcon } from '@/features/reservation/PurposeIcon';
import { phoneCountry, type ReservationDto } from '@hostly/shared';
import { guestName, useDayReservations } from '@/lib/day';
import { useTables } from '@/lib/queries';
import { fmtTime } from '@/lib/time';
import { useUi } from '@/store/ui';
import { CustomerBadge, flagEmoji, ReservationCard, SOURCE_ICON } from '@/features/reservation/ReservationCard';

type SortKey = 'arrival' | 'surname' | 'covers' | 'tables' | 'return';

const GROUPS = [
  { key: 'booked', statuses: ['pending', 'confirmed'] },
  { key: 'seated', statuses: ['seated'] },
  { key: 'completed', statuses: ['completed'] },
  { key: 'cancelled', statuses: ['cancelled', 'no_show'] },
] as const;

export default function ReservationsPage() {
  const { t } = useTranslation();
  const { restaurant, reservations, query } = useDayReservations();
  const { data: tables = [] } = useTables();
  const { search, openReservation } = useUi();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'arrival', dir: 1 });
  const [showCancelled, setShowCancelled] = useState(false);
  const labelOf = useMemo(() => new Map(tables.map((tb) => [tb.id, tb.label])), [tables]);
  const labels = (r: ReservationDto) => r.tableIds.map((id) => labelOf.get(id) ?? '?').join(', ');

  const q = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const filtered = reservations.filter(
      (r) => !q || [r.firstName, r.lastName, r.phone, r.email, r.notes, labels(r), ...r.tags].some((v) => v?.toLowerCase().includes(q)),
    );
    const val = (r: ReservationDto): string | number => {
      switch (sort.key) {
        case 'surname':
          return guestName(r).toLowerCase();
        case 'covers':
          return r.covers;
        case 'tables':
          return labels(r) || '~';
        case 'return':
          return r.departureAt;
        default:
          return r.arrivalAt;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, q, sort, labelOf]);

  if (!restaurant) return null;
  const tz = restaurant.timezone;
  const homeLanguage = restaurant.defaultLanguage;
  const groupTitle = (key: string) =>
    key === 'booked' ? t('floor.upcoming') : key === 'seated' ? t('floor.seated') : key === 'completed' ? t('floor.completed') : t('list.showCancelled');

  const header = (key: SortKey, label: string, className = '') => (
    <th className={`px-2 py-2 font-medium ${className}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
      </button>
    </th>
  );

  return (
    <div className="h-full overflow-y-auto p-3">
      {query.isLoading && <p className="p-6 text-center text-muted">{t('common.loading')}</p>}
      {!query.isLoading && rows.length === 0 && <p className="p-6 text-center text-muted">{t('list.empty')}</p>}
      {GROUPS.map((g) => {
        const items = rows.filter((r) => (g.statuses as readonly string[]).includes(r.status));
        if (!items.length) return null;
        const collapsed = g.key === 'cancelled' && !showCancelled;
        return (
          <section key={g.key} className="mb-5">
            <button
              type="button"
              disabled={g.key !== 'cancelled'}
              onClick={() => setShowCancelled((v) => !v)}
              className="mb-2 flex w-full items-center justify-between px-1 text-sm font-semibold tracking-wide text-muted uppercase"
            >
              <span>
                {groupTitle(g.key)} · {items.length}
              </span>
              <span>
                {t('common.coversShort')} {items.reduce((n, r) => n + r.covers, 0)}
              </span>
            </button>
            {!collapsed && (
              <>
                {/* Phones: cards */}
                <div className="flex flex-col gap-1.5 md:hidden">
                  {items.map((r) => (
                    <ReservationCard key={r.id} r={r} tableLabels={labels(r)} timezone={tz} onOpen={() => openReservation(r.id)} />
                  ))}
                </div>
                {/* Tablets and up: table */}
                <div className="card hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-[15px]">
                    <thead className="border-b border-border text-xs text-muted uppercase">
                      <tr>
                        <th className="w-8 px-2 py-2" aria-label={t('list.purpose')} />
                        {header('surname', t('list.surname'))}
                        {header('covers', t('list.covers'), 'text-right')}
                        {header('tables', t('list.tables'))}
                        {header('arrival', t('list.arrival'))}
                        {header('return', t('list.return'))}
                        <th className="px-2 py-2 font-medium">{t('list.source')}</th>
                        <th className="px-2 py-2 font-medium">{t('list.notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((r) => {
                        const flag = r.language !== homeLanguage ? flagEmoji(phoneCountry(r.phone)) || r.language.toUpperCase() : '';
                        return (
                          <tr
                            key={r.id}
                            onClick={() => openReservation(r.id)}
                            className="h-13 cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-2"
                          >
                            <td className="px-2 text-muted" title={t(`purpose.${r.purpose}`)}>
                              <PurposeIcon purpose={r.purpose} size={18} />
                            </td>
                            <td className="px-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold">{guestName(r)}</span>
                                {flag && <span className="text-xs">{flag}</span>}
                                <CustomerBadge type={r.customerType} />
                              </div>
                            </td>
                            <td className="px-2 text-right font-bold tabular-nums">{r.covers}</td>
                            <td className={`px-2 whitespace-nowrap ${labels(r) ? '' : 'font-semibold text-warn'}`}>{labels(r) || t('topbar.withoutTable')}</td>
                            <td className="px-2 tabular-nums">{fmtTime(r.arrivalAt, tz)}</td>
                            <td className="px-2 text-muted tabular-nums" title={r.departureEstimated ? t('reservation.endAuto') : undefined}>
                              {r.departureEstimated ? '~' : ''}
                              {fmtTime(r.departureAt, tz)}
                            </td>
                            <td className="px-2 text-muted" title={t(`source.${r.source}`)}>
                              {SOURCE_ICON[r.source]}
                            </td>
                            <td className="max-w-64 px-2">
                              <div className="flex flex-wrap items-center gap-1">
                                {[...r.tags, ...r.dietary].map((tag) => (
                                  <span key={tag} className="rounded bg-surface-3 px-1.5 text-xs">
                                    {tag}
                                  </span>
                                ))}
                                {r.notes && <span className="truncate text-sm text-muted italic">{r.notes}</span>}
                                {g.key === 'cancelled' && <span className="text-xs text-danger">{t(`status.${r.status}`)}</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
