import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import type { ReservationDto, SlotPace } from '@hostly/shared';
import { api } from '@/lib/api';
import { dayWindow, todayBusinessDate } from '@/lib/time';
import { guestName, isLive, shiftsFor, useDayReservations } from '@/lib/day';
import { qk, useAreas, useTables } from '@/lib/queries';
import { useUi } from '@/store/ui';
import { useReservationActions } from '@/features/reservation/actions';

const COL = 44;
const ROW = 52;
const LABEL_W = 96;

const BAR_COLOR: Record<string, string> = {
  pending: 'bg-st-pending',
  confirmed: 'bg-st-reserved',
  seated: 'bg-st-seated',
  completed: 'bg-st-completed',
};

interface Drag {
  r: ReservationDto;
  fromTableId: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

export default function TimelinePage() {
  const { t } = useTranslation();
  const { date, restaurant, all } = useDayReservations();
  const { data: tables = [] } = useTables();
  const { data: areas = [] } = useAreas();
  const { openReservation } = useUi();
  const { move } = useReservationActions();
  const pace = useQuery({ queryKey: qk.pace(date ?? ''), queryFn: () => api.get<SlotPace[]>('/reservations/pace', { date: date! }), enabled: !!date });
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => DateTime.now());
  useEffect(() => {
    const id = setInterval(() => setNow(DateTime.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const areaOrder = new Map(areas.map((a, i) => [a.id, i]));
    return tables
      .filter((tb) => tb.active)
      .sort((a, b) => (areaOrder.get(a.areaId) ?? 0) - (areaOrder.get(b.areaId) ?? 0) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [tables, areas]);
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  // Grid spans the day's opening hours (falls back to the whole business day).
  const range = useMemo(() => {
    if (!restaurant || !date) return null;
    const shifts = shiftsFor(restaurant, date);
    if (!shifts.length) return dayWindow(restaurant, date);
    const start = DateTime.min(...shifts.map((s) => s.start))!;
    const end = DateTime.max(...shifts.map((s) => s.end))!;
    return { start, end };
  }, [restaurant, date]);

  const slotMin = restaurant?.slotMinutes ?? 15;
  const slots = useMemo(() => {
    if (!range) return [];
    const list: DateTime[] = [];
    for (let at = range.start; at < range.end; at = at.plus({ minutes: slotMin })) list.push(at);
    return list;
  }, [range, slotMin]);
  const paceBy = new Map((pace.data ?? []).map((p) => [DateTime.fromISO(p.at).toMillis(), p]));
  const isToday = !!restaurant && date === todayBusinessDate(restaurant);

  // Scroll to "now" (or the first booking) once.
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!range || !scroller.current || scrolled.current === date) return;
    scrolled.current = date;
    const target = isToday ? DateTime.now() : all.length ? DateTime.fromISO(all[0].arrivalAt) : range.start;
    const x = (target.diff(range.start, 'minutes').minutes / slotMin) * COL - 120;
    scroller.current.scrollLeft = Math.max(0, x);
  }, [range, date, isToday, all, slotMin]);

  if (!restaurant || !range) return null;
  const tz = restaurant.timezone;
  const xOf = (iso: string) => (DateTime.fromISO(iso).diff(range.start, 'minutes').minutes / slotMin) * COL;
  const width = slots.length * COL;
  const maxCovers = restaurant.pacingMaxCoversPerSlot;
  const maxRes = restaurant.pacingMaxReservationsPerSlot;
  const bars = all.filter((r) => isLive(r));

  const onBarDown = (e: ReactPointerEvent<HTMLDivElement>, r: ReservationDto, tableId: string, mode: Drag['mode']) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ r, fromTableId: tableId, mode, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, moved: false });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 6 || Math.abs(dy) > 6 });
  };
  const onUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      openReservation(d.r.id);
      return;
    }
    const steps = Math.round(d.dx / COL);
    const arrival = DateTime.fromISO(d.r.arrivalAt);
    const departure = DateTime.fromISO(d.r.departureAt);
    if (d.mode === 'resize') {
      const newDep = departure.plus({ minutes: steps * slotMin });
      if (newDep <= arrival) return;
      move.mutate({ id: d.r.id, tableIds: d.r.tableIds, departureAt: newDep.toISO()! });
      return;
    }
    const rowShift = Math.round(d.dy / ROW);
    const fromIdx = rows.findIndex((tb) => tb.id === d.fromTableId);
    const target = rows[Math.min(rows.length - 1, Math.max(0, fromIdx + rowShift))];
    const tableIds = d.r.tableIds.map((id) => (id === d.fromTableId ? target.id : id));
    move.mutate({
      id: d.r.id,
      tableIds: [...new Set(tableIds)],
      arrivalAt: arrival.plus({ minutes: steps * slotMin }).toISO()!,
      departureAt: departure.plus({ minutes: steps * slotMin }).toISO()!,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <p className="hidden px-3 py-1.5 text-xs text-muted sm:block">{t('timeline.dragHint')}</p>
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
        <div style={{ width: width + LABEL_W }} className="relative">
          {/* Header: time + pace */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-surface" style={{ height: 52 }}>
            <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-border bg-surface px-2 text-[11px] text-muted" style={{ width: LABEL_W }}>
              <span>{t('timeline.pace')}</span>
              <span>
                {t('common.reservationsShort')} / {t('common.coversShort')}
              </span>
            </div>
            {slots.map((s) => {
              const p = paceBy.get(s.toMillis());
              const over = (maxCovers !== null && (p?.covers ?? 0) > maxCovers) || (maxRes !== null && (p?.reservations ?? 0) > maxRes);
              return (
                <div key={s.toMillis()} className={`shrink-0 border-l px-1 ${s.minute === 0 ? 'border-border' : 'border-border/30'}`} style={{ width: COL }}>
                  <div className={`text-[11px] font-semibold ${s.minute === 0 ? 'text-text' : 'text-transparent'}`}>{s.setZone(tz).toFormat('HH:mm')}</div>
                  <div className={`text-[10px] leading-tight tabular-nums ${over ? 'font-bold text-warn' : p ? 'text-text' : 'text-muted/60'}`}>
                    {p?.reservations ?? 0}
                    {maxRes !== null ? `/${maxRes}` : ''}
                    <br />
                    {p?.covers ?? 0}
                    {maxCovers !== null ? `/${maxCovers}` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {rows.map((tb, rowIdx) => (
            <div key={tb.id} className="relative flex border-b border-border/50" style={{ height: ROW }}>
              <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-border bg-surface px-2" style={{ width: LABEL_W }}>
                <span className="text-sm font-semibold">
                  {tb.label} <span className="text-xs font-normal text-muted">{tb.minSeats}-{tb.maxSeats}</span>
                </span>
                <span className="truncate text-[11px] text-muted">{areaName.get(tb.areaId)}</span>
              </div>
              <div className="relative" style={{ width }}>
                {slots.map((s, i) => (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 border-l ${s.minute === 0 ? 'border-border/70' : 'border-border/20'}`}
                    style={{ left: i * COL }}
                  />
                ))}
                {bars
                  .filter((r) => r.tableIds.includes(tb.id))
                  .map((r) => {
                    const active = drag && drag.r.id === r.id && drag.fromTableId === tb.id && drag.moved;
                    const left = xOf(r.arrivalAt) + (active && drag.mode === 'move' ? drag.dx : 0);
                    const w = Math.max(COL / 2, xOf(r.departureAt) - xOf(r.arrivalAt) + (active && drag.mode === 'resize' ? drag.dx : 0));
                    const top = 5 + (active && drag.mode === 'move' ? Math.round(drag.dy / ROW) * ROW : 0);
                    return (
                      <div
                        key={r.id}
                        onPointerDown={(e) => onBarDown(e, r, tb.id, 'move')}
                        className={`absolute flex touch-none items-center overflow-hidden rounded-lg px-2 text-white shadow ${BAR_COLOR[r.status] ?? 'bg-st-reserved'} ${
                          active ? 'z-30 opacity-90 ring-2 ring-accent' : 'z-0'
                        } ${r.status === 'completed' ? 'opacity-60' : ''} cursor-grab`}
                        style={{ left, width: w, top, height: ROW - 10 }}
                        data-row={rowIdx}
                      >
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="truncate text-sm font-semibold">{guestName(r)}</div>
                          <div className="truncate text-[11px] opacity-90">
                            {r.covers} · {DateTime.fromISO(r.arrivalAt).setZone(tz).toFormat('HH:mm')}–{DateTime.fromISO(r.departureAt).setZone(tz).toFormat('HH:mm')}
                          </div>
                        </div>
                        {r.status !== 'completed' && (
                          <div
                            className="absolute top-0 right-0 bottom-0 w-4 cursor-ew-resize touch-none bg-white/20"
                            onPointerDown={(e) => onBarDown(e, r, tb.id, 'resize')}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}

          {/* Now line */}
          {isToday && now > range.start && now < range.end && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-accent shadow-[0_0_8px] shadow-accent"
              style={{ left: LABEL_W + (now.diff(range.start, 'minutes').minutes / slotMin) * COL }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
