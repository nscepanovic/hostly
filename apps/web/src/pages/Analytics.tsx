import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { ChevronDown, ReceiptText } from 'lucide-react';
import type { AnalyticsDto, ReceiptDto, ReservationDto, RestaurantDto } from '@hostly/shared';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart, type Column } from '@/components/charts/ColumnChart';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { guestName } from '@/lib/day';
import { CURRENCY, fmtAmount, fmtMoney, fmtQty } from '@/lib/money';
import { useRestaurant } from '@/lib/queries';
import { dayWindow, fmtDateTime, langInfo, shiftDate, todayBusinessDate } from '@/lib/time';
import { useReceiptUi } from '@/store/receipts';
import { ReceiptView } from '@/features/receipts/ReceiptView';

const RANGES = [7, 30, 90] as const;

/** Sales from scanned fiscal receipts: what sells, when, and how much guests spend. */
export default function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const { data: restaurant } = useRestaurant();
  const openScanner = useReceiptUi((s) => s.openScanner);
  const today = restaurant ? todayBusinessDate(restaurant) : null;
  const [days, setDays] = useState<number | null>(30);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const range = custom ?? (today && days ? { from: shiftDate(today, -(days - 1)), to: today } : null);

  const analytics = useQuery({
    queryKey: ['analytics', range?.from, range?.to],
    queryFn: () => api.get<AnalyticsDto>('/analytics', range!),
    enabled: !!range,
  });
  const a = analytics.data;
  const lang = i18n.language;
  const locale = langInfo(lang).locale;
  const money = (v: number) => fmtMoney(v, lang, 0);
  const amount = (v: number) => fmtAmount(v, lang);
  const tick = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }), [locale]);
  const receiptsText = (n: number) => t('analytics.receiptsCount', { count: n });

  const byDay: Column[] = useMemo(() => {
    if (!a) return [];
    const every = Math.max(1, Math.ceil(a.byDay.length / 8));
    return a.byDay.map((d, i) => {
      const dt = DateTime.fromISO(d.date).setLocale(locale);
      return { key: d.date, axisLabel: dt.toFormat('dd.LL.'), labelled: (a.byDay.length - 1 - i) % every === 0, title: dt.toFormat(langInfo(lang).dateLong), value: d.revenue, detail: receiptsText(d.receipts) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, locale, lang]);
  const byHour: Column[] = useMemo(() => {
    if (!a?.byHour.length) return [];
    const hours = a.byHour.map((h) => h.hour);
    const map = new Map(a.byHour.map((h) => [h.hour, h]));
    const out: Column[] = [];
    for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
      const row = map.get(h);
      const label = `${String(h).padStart(2, '0')}h`;
      out.push({ key: String(h), axisLabel: label, labelled: true, title: `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`, value: row?.revenue ?? 0, detail: receiptsText(row?.receipts ?? 0) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a]);
  const byWeekday: Column[] = useMemo(() => {
    if (!a) return [];
    const map = new Map(a.byWeekday.map((w) => [w.weekday, w]));
    return [1, 2, 3, 4, 5, 6, 7].map((wd) => {
      const dt = DateTime.fromObject({ weekday: wd as 1 }).setLocale(locale);
      const row = map.get(wd);
      return { key: String(wd), axisLabel: dt.toFormat('ccc'), labelled: true, title: dt.toFormat('cccc'), value: row?.revenue ?? 0, detail: receiptsText(row?.receipts ?? 0) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, locale]);

  if (!restaurant || !range) return null;
  const coverage = a && a.completedReservations ? Math.round((a.completedWithReceipt / a.completedReservations) * 100) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 pb-24">
        {/* Filters: one row above the charts. */}
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDays(d);
                setCustom(null);
              }}
              className={`h-11 rounded-lg px-4 font-medium ${!custom && days === d ? 'bg-accent text-accent-ink' : 'border border-border bg-surface-2'}`}
            >
              {t('analytics.lastDays', { count: d })}
            </button>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="field h-11 w-auto"
              aria-label={t('analytics.from')}
              value={range.from}
              max={range.to}
              onChange={(e) => e.target.value && setCustom({ from: e.target.value, to: range.to })}
            />
            <span className="text-muted">–</span>
            <input
              type="date"
              className="field h-11 w-auto"
              aria-label={t('analytics.to')}
              value={range.to}
              min={range.from}
              onChange={(e) => e.target.value && setCustom({ from: range.from, to: e.target.value })}
            />
          </div>
          <Button variant="primary" className="ml-auto" icon={<ReceiptText size={18} />} onClick={() => openScanner()}>
            {t('receipts.scan')}
          </Button>
        </div>

        {analytics.isError && <p className="text-danger">{errorMessage(analytics.error)}</p>}
        {a && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label={t('analytics.revenue')} value={amount(a.revenue)} unit={CURRENCY} />
              <Tile label={t('analytics.receipts')} value={String(a.receipts)} />
              <Tile label={t('analytics.averageReceipt')} value={a.averageReceipt !== null ? amount(a.averageReceipt) : '—'} unit={a.averageReceipt !== null ? CURRENCY : undefined} />
              <Tile
                label={t('analytics.perGuest')}
                value={a.revenuePerCover !== null ? amount(a.revenuePerCover) : '—'}
                unit={a.revenuePerCover !== null ? CURRENCY : undefined}
                hint={t('analytics.perGuestHint', { count: a.coversWithReceipt })}
              />
              <Tile
                label={t('analytics.coverage')}
                value={coverage !== null ? `${coverage}%` : '—'}
                hint={t('analytics.coverageHint', { scanned: a.completedWithReceipt, total: a.completedReservations })}
              />
            </div>

            {a.receipts === 0 ? (
              <div className="card flex flex-col items-center gap-3 p-8 text-center">
                <ReceiptText size={36} className="text-muted" />
                <p className="max-w-md text-muted">{t('analytics.empty')}</p>
              </div>
            ) : (
              <>
                <ColumnChart title={t('analytics.revenueByDay')} columns={byDay} valueLabel={t('analytics.revenue')} format={money} formatTick={(v) => tick.format(v)} />
                <div className="grid gap-4 md:grid-cols-2">
                  <ColumnChart title={t('analytics.revenueByHour')} columns={byHour} valueLabel={t('analytics.revenue')} format={money} formatTick={(v) => tick.format(v)} />
                  <ColumnChart title={t('analytics.revenueByWeekday')} columns={byWeekday} valueLabel={t('analytics.revenue')} format={money} formatTick={(v) => tick.format(v)} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <BarList
                    title={t('analytics.topItems')}
                    empty={t('analytics.noItems')}
                    rows={a.topItems.map((i) => ({ key: i.name, label: i.name, value: i.revenue, valueText: money(i.revenue), detail: `${fmtQty(i.quantity, lang)}×`, title: receiptsText(i.receipts) }))}
                  />
                  <div className="flex min-w-0 flex-col gap-4">
                    {a.itemsByShift.map((s) => (
                      <BarList
                        key={s.shift}
                        title={`${t('analytics.bestIn')} ${t(`shift.${s.shift}`, { defaultValue: s.shift === 'other' ? t('analytics.outsideShifts') : s.shift })}`}
                        empty={t('analytics.noItems')}
                        rows={s.items.slice(0, 5).map((i) => ({ key: i.name, label: i.name, value: i.revenue, valueText: money(i.revenue), detail: `${fmtQty(i.quantity, lang)}×` }))}
                      />
                    ))}
                    {a.payments.length > 0 && (
                      <BarList
                        title={t('analytics.payments')}
                        empty=""
                        rows={a.payments.map((p) => ({ key: p.method, label: t(`receipts.payment.${p.method}`), value: p.amount, valueText: money(p.amount), detail: a.revenue ? `${Math.round((p.amount / a.revenue) * 100)}%` : undefined }))}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        <ReceiptList restaurant={restaurant} from={range.from} to={range.to} />
      </div>
    </div>
  );
}

function Tile({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="card min-w-0 p-3">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      {/* Currency as a small unit so large amounts fit the tile. */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-sm font-medium text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Receipts in the range; unlinked ones can be linked to a guest of that day. */
function ReceiptList({ restaurant, from, to }: { restaurant: RestaurantDto; from: string; to: string }) {
  const { t, i18n } = useTranslation();
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const start = dayWindow(restaurant, from).start;
  const end = dayWindow(restaurant, to).end;
  const receipts = useQuery({
    queryKey: ['receipts', 'list', from, to, onlyUnlinked],
    queryFn: () => api.get<ReceiptDto[]>('/receipts', { from: start.toISO(), to: end.toISO(), unassigned: onlyUnlinked ? '1' : undefined, limit: 300 }),
  });
  const list = receipts.data ?? [];
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="flex-1 font-semibold">{t('receipts.title')}</h3>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={onlyUnlinked} onChange={(e) => setOnlyUnlinked(e.target.checked)} />
          {t('receipts.onlyUnlinked')}
        </label>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{t('receipts.none')}</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((r) => (
            <li key={r.id} className="border-t border-border/60">
              <button type="button" className="flex min-h-12 w-full items-center gap-3 py-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                <span className="w-32 shrink-0 text-sm text-muted tabular-nums">{fmtDateTime(r.issuedAt, restaurant.timezone, i18n.language)}</span>
                <span className={`min-w-0 flex-1 truncate ${r.guestName ? '' : 'text-warn'}`}>{r.guestName ?? t('receipts.unlinked')}</span>
                {r.status !== 'ready' && <span className="rounded bg-warn/15 px-1.5 text-xs text-warn">{t(`receipts.status.${r.status}`)}</span>}
                <span className={`shrink-0 font-semibold tabular-nums ${r.total < 0 ? 'text-danger' : ''}`}>{fmtMoney(r.total, i18n.language)}</span>
                <ChevronDown size={18} className={`shrink-0 text-muted transition ${open === r.id ? 'rotate-180' : ''}`} />
              </button>
              {open === r.id && (
                <div className="flex flex-col gap-2 pb-3">
                  <ReceiptView receipt={r} />
                  <AssignReceipt receipt={r} restaurant={restaurant} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Link (or move) a receipt to one of that day's reservations. */
function AssignReceipt({ receipt, restaurant }: { receipt: ReceiptDto; restaurant: RestaurantDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const issued = DateTime.fromISO(receipt.issuedAt).setZone(restaurant.timezone);
  // Business date of the receipt (before dayStart belongs to the previous day).
  const date = (issued.toFormat('HH:mm') < restaurant.dayStart ? issued.minus({ days: 1 }) : issued).toISODate()!;
  const day = useQuery({ queryKey: ['reservations', date], queryFn: () => api.get<ReservationDto[]>('/reservations', { date }) });
  const options = (day.data ?? [])
    .filter((r) => r.status === 'seated' || r.status === 'completed')
    .sort((x, y) => Math.abs(DateTime.fromISO(x.departureAt).toMillis() - issued.toMillis()) - Math.abs(DateTime.fromISO(y.departureAt).toMillis() - issued.toMillis()));
  const assign = useMutation({
    mutationFn: (reservationId: string | null) => api.patch<ReceiptDto>(`/receipts/${receipt.id}`, { reservationId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      toast.success(t('receipts.linked'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{t('receipts.guest')}</span>
      <select className="field h-11 w-auto min-w-56 flex-1" value={receipt.reservationId ?? ''} disabled={assign.isPending} onChange={(e) => assign.mutate(e.target.value || null)}>
        <option value="">{t('receipts.unlinked')}</option>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {guestName(r)} · {r.covers} · {DateTime.fromISO(r.arrivalAt).setZone(restaurant.timezone).toFormat('HH:mm')}
          </option>
        ))}
      </select>
    </label>
  );
}
