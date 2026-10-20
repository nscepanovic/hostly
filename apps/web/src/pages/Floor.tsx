import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PencilRuler, X } from 'lucide-react';
import type { ReservationDto, TableDto } from '@hostly/shared';
import { FloorCanvas } from '@/components/floor/FloorCanvas';
import { IconButton } from '@/components/ui/Button';
import { guestName, useDayReservations } from '@/lib/day';
import { useAreas, useMe, useTables } from '@/lib/queries';
import { computeTableStatuses } from '@/lib/tableState';
import { todayBusinessDate } from '@/lib/time';
import { useUi } from '@/store/ui';
import { DragGhost, useDrag } from '@/features/floor/drag';
import { ReservationPanel } from '@/features/floor/ReservationPanel';
import { TablePopover } from '@/features/floor/TablePopover';
import { useReservationActions } from '@/features/reservation/actions';

/** Re-render every 30s so "late" states and the completed fade update on their own. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function FloorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: areas = [] } = useAreas();
  const { data: tables = [] } = useTables();
  const { date, restaurant, reservations, all } = useDayReservations();
  const { areaId, setAreaId, search, panelOpen } = useUi();
  const { move } = useReservationActions();
  const overTableId = useDrag((s) => s.overTableId);
  const now = useNow();
  const [zoom, setZoom] = useState(1);
  const [tapped, setTapped] = useState<TableDto | null>(null);
  const [assigning, setAssigning] = useState<ReservationDto | null>(null);

  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const areaTables = useMemo(() => tables.filter((tb) => tb.active && tb.areaId === area?.id), [tables, area]);
  const isToday = !!restaurant && date === todayBusinessDate(restaurant);
  // Table colours use the whole day (not the shift filter) so a table never looks free when it is not.
  const statuses = useMemo(() => computeTableStatuses(all, isToday ? now : null), [all, isToday, now]);

  const q = search.trim().toLowerCase();
  const highlight = useMemo(() => {
    const ids = new Set<string>();
    if (overTableId) ids.add(overTableId);
    if (assigning) assigning.tableIds.forEach((id) => ids.add(id));
    if (q) {
      for (const tb of areaTables) {
        const r = statuses.get(tb.id)?.reservation;
        if (tb.label.toLowerCase().includes(q) || (r && guestName(r).toLowerCase().includes(q))) ids.add(tb.id);
      }
    }
    return ids;
  }, [overTableId, assigning, q, areaTables, statuses]);

  if (!restaurant) return null;

  const onTableTap = (tb: TableDto) => {
    if (assigning) {
      move.mutate({ id: assigning.id, tableIds: [tb.id] });
      setAssigning(null);
      return;
    }
    setTapped(tb);
  };

  const canvas = (
    <div className="relative h-full min-h-0">
      {assigning && (
        <div className="absolute inset-x-2 bottom-2 z-10 flex items-center gap-2 rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink shadow-xl">
          <span className="flex-1">{t('floor.pickTableFor', { name: guestName(assigning), covers: assigning.covers })}</span>
          <IconButton label={t('common.cancel')} onClick={() => setAssigning(null)} className="text-accent-ink">
            <X size={22} />
          </IconButton>
        </div>
      )}
      <FloorCanvas
        tables={areaTables}
        statuses={statuses}
        reservations={all}
        timezone={restaurant.timezone}
        zoom={zoom}
        onZoom={setZoom}
        onTableTap={onTableTap}
        highlightIds={highlight}
        header={
          areas.length > 1 ? (
            <select className="field h-11 w-auto max-w-full" value={area?.id ?? ''} onChange={(e) => setAreaId(e.target.value)} aria-label={t('floor.area')}>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate px-1 font-semibold">{area?.name}</span>
          )
        }
        toolbar={
          me?.role === 'owner' ? (
            <IconButton label={t('nav.editor')} onClick={() => navigate('/editor')}>
              <PencilRuler size={20} />
            </IconButton>
          ) : undefined
        }
      />
    </div>
  );

  return (
    // Portrait tablets and phones: plan on top, list below. Wide screens: list on the left.
    <div className="flex h-full flex-col lg:flex-row-reverse">
      <div className={`min-h-0 ${panelOpen ? 'basis-[52%]' : 'flex-1'} lg:basis-auto lg:flex-1`}>{canvas}</div>
      <div className={`min-h-0 border-t border-border lg:w-[380px] lg:border-t-0 lg:border-r ${panelOpen ? 'flex-1' : 'shrink-0'} lg:flex-none`}>
        <ReservationPanel
          reservations={reservations}
          tables={tables}
          timezone={restaurant.timezone}
          search={search}
          onAssign={(r) => setAssigning(r)}
        />
      </div>
      {tapped && (
        <TablePopover
          table={tapped}
          status={statuses.get(tapped.id)}
          timezone={restaurant.timezone}
          onClose={() => setTapped(null)}
          onMove={(r) => setAssigning(r)}
        />
      )}
      <DragGhost />
    </div>
  );
}
