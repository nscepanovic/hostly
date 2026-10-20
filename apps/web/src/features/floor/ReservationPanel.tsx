import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, GripVertical, MoveRight } from 'lucide-react';
import type { ReservationDto, TableDto } from '@hostly/shared';
import { Segmented } from '@/components/ui/Segmented';
import { guestName, isActive } from '@/lib/day';
import { usePriority, useWaiting } from '@/lib/queries';
import { useUi, type PanelTab } from '@/store/ui';
import { ReservationCard } from '../reservation/ReservationCard';
import { useReservationActions } from '../reservation/actions';
import { PriorityList } from './PriorityList';
import { WaitingList } from '../waiting/WaitingList';
import { startReservationDrag } from './drag';

export function ReservationPanel({
  reservations,
  tables,
  timezone,
  onAssign,
  search,
}: {
  reservations: ReservationDto[];
  tables: TableDto[];
  timezone: string;
  onAssign: (r: ReservationDto) => void;
  search: string;
}) {
  const { t } = useTranslation();
  const { panelTab, setPanelTab, panelOpen, setPanelOpen, openReservation } = useUi();
  const { data: priority = [] } = usePriority();
  const { data: waiting = [] } = useWaiting();
  const { move } = useReservationActions();
  const labelOf = useMemo(() => new Map(tables.map((tb) => [tb.id, tb.label])), [tables]);
  const labels = (r: ReservationDto) => r.tableIds.map((id) => labelOf.get(id) ?? '?').join(', ');

  const q = search.trim().toLowerCase();
  const matches = (r: ReservationDto) =>
    !q || [r.firstName, r.lastName, r.phone, r.email, labels(r)].some((v) => v?.toLowerCase().includes(q));

  const groups = useMemo(() => {
    const live = reservations.filter(matches);
    return [
      { key: 'upcoming', title: t('floor.upcoming'), items: live.filter((r) => r.status === 'confirmed' || r.status === 'pending') },
      { key: 'seated', title: t('floor.seated'), items: live.filter((r) => r.status === 'seated') },
      { key: 'completed', title: t('floor.completed'), items: live.filter((r) => r.status === 'completed') },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, q, t, labelOf]);
  const bookedCount = reservations.filter(isActive).length;

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <Segmented<PanelTab>
          className="min-w-0 flex-1"
          value={panelTab}
          onChange={setPanelTab}
          options={[
            { value: 'booked', label: t('floor.booked'), badge: bookedCount },
            { value: 'waiting', label: t('floor.waiting'), badge: waiting.length },
            { value: 'priority', label: t('floor.priority'), badge: priority.length },
          ]}
        />
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 lg:hidden"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? t('floor.hidePanel') : t('floor.showPanel')}
        >
          {panelOpen ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
        </button>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto p-2 ${panelOpen ? '' : 'hidden lg:block'}`}>
        {panelTab === 'booked' &&
          (groups.every((g) => !g.items.length) ? (
            <p className="p-6 text-center text-muted">{t('floor.noReservations')}</p>
          ) : (
            groups.map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.key} className="mb-3">
                    <div className="mb-1.5 flex items-center justify-between px-1 text-xs font-semibold tracking-wide text-muted uppercase">
                      <span>
                        {g.title} · {g.items.length}
                      </span>
                      <span>
                        {t('common.coversShort')} {g.items.reduce((n, r) => n + r.covers, 0)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {g.items.map((r) => (
                        <ReservationCard
                          key={r.id}
                          r={r}
                          tableLabels={labels(r)}
                          timezone={timezone}
                          onOpen={() => openReservation(r.id)}
                          dragHandle={
                            g.key !== 'completed' ? (
                              <div
                                className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted"
                                onPointerDown={(e) =>
                                  startReservationDrag(e, r.id, `${guestName(r)} · ${r.covers}`, (tableId) =>
                                    move.mutate({ id: r.id, tableIds: [tableId] }),
                                  )
                                }
                              >
                                <GripVertical size={20} />
                              </div>
                            ) : undefined
                          }
                          action={
                            g.key !== 'completed' ? (
                              <button
                                type="button"
                                onClick={() => onAssign(r)}
                                className={`flex w-12 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-semibold ${
                                  r.tableIds.length ? 'bg-surface-3 text-text' : 'bg-warn/20 text-warn'
                                }`}
                                aria-label={r.tableIds.length ? t('floor.move') : t('floor.assign')}
                              >
                                <MoveRight size={18} />
                                {r.tableIds.length ? t('floor.move') : t('floor.assign')}
                              </button>
                            ) : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                ),
            )
          ))}
        {panelTab === 'waiting' && <WaitingList entries={waiting} />}
        {panelTab === 'priority' && <PriorityList items={priority} tables={tables} timezone={timezone} />}
      </div>
    </section>
  );
}
