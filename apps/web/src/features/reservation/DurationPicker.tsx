import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { luxonLocale } from '@/i18n';
import type { FormState } from './ReservationModal';

/** Quick durations (minutes) offered as chips. */
export const DURATION_CHIPS = [60, 90, 120, 150, 180, 240];

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};

/**
 * How long the reservation lasts: automatic (estimated from party size, no end
 * stored), a quick duration, or an explicit end date and time (may cross midnight).
 */
export function DurationPicker({
  form,
  set,
  startLocal,
  endLocal,
  estimateMin,
  invalid,
  slotMinutes,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  startLocal: string | null;
  endLocal: string | null;
  estimateMin: number;
  invalid: boolean;
  slotMinutes: number;
}) {
  const { t, i18n } = useTranslation();
  const chip = (active: boolean) =>
    `h-11 shrink-0 rounded-lg px-3 text-[15px] font-semibold whitespace-nowrap ${active ? 'bg-accent text-accent-ink' : 'border border-border bg-surface-2'}`;
  const times = Array.from({ length: (24 * 60) / slotMinutes }, (_, i) => DateTime.fromObject({ hour: 0 }).plus({ minutes: i * slotMinutes }).toFormat('HH:mm'));
  const end = endLocal ? DateTime.fromISO(endLocal).setLocale(luxonLocale(i18n.language)) : null;
  const start = startLocal ? DateTime.fromISO(startLocal) : null;
  const sameDay = !!start && !!end && start.hasSame(end, 'day');
  const lasts = start && end && !invalid ? Math.round(end.diff(start, 'minutes').minutes) : null;

  const openCustom = () => {
    if (form.endMode !== 'custom' && endLocal) {
      set('endDate', endLocal.slice(0, 10));
      set('endTime', endLocal.slice(11, 16));
    }
    set('endMode', 'custom');
  };

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="label mb-0">{t('reservation.duration')}</span>
        {end && (
          <span className={`text-sm ${invalid ? 'font-semibold text-danger' : 'text-muted'}`}>
            {invalid
              ? t('reservation.endBeforeStart')
              : form.endMode === 'auto'
                ? `${t('reservation.endsAt')}: ${t('reservation.endsAtOpen', { time: `~${end.toFormat(sameDay ? 'HH:mm' : 'ccc dd.LL. HH:mm')}` })}`
                : `${t('reservation.endsAt')}: ${end.toFormat(sameDay ? 'HH:mm' : 'ccc dd.LL. HH:mm')}${lasts ? ` (${fmtDuration(lasts)})` : ''}`}
          </span>
        )}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button type="button" className={chip(form.endMode === 'auto')} onClick={() => set('endMode', 'auto')} title={t('reservation.endAutoHint', { duration: fmtDuration(estimateMin) })}>
          {t('reservation.endAuto')} · ~{fmtDuration(estimateMin)}
        </button>
        {DURATION_CHIPS.map((m) => (
          <button
            key={m}
            type="button"
            className={chip(form.endMode === 'duration' && form.durationMin === m)}
            onClick={() => {
              set('durationMin', m);
              set('endMode', 'duration');
            }}
          >
            {fmtDuration(m)}
          </button>
        ))}
        <button type="button" className={chip(form.endMode === 'custom')} onClick={openCustom}>
          {t('reservation.endCustom')}
        </button>
      </div>
      {form.endMode === 'auto' && <p className="mt-1 text-xs text-muted">{t('reservation.endAutoHint', { duration: fmtDuration(estimateMin) })}</p>}
      {form.endMode === 'custom' && (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
          <label className="min-w-0">
            <span className="label">{t('reservation.endDate')}</span>
            <input className="field" type="date" value={form.endDate} onChange={(e) => e.target.value && set('endDate', e.target.value)} />
          </label>
          <label className="min-w-0">
            <span className="label">{t('reservation.endTime')}</span>
            <select className="field tabular-nums" value={form.endTime} onChange={(e) => set('endTime', e.target.value)}>
              {!times.includes(form.endTime) && form.endTime && <option value={form.endTime}>{form.endTime}</option>}
              {times.map((tm) => (
                <option key={tm} value={tm}>
                  {tm}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
