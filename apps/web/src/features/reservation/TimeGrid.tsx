import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import type { RestaurantDto } from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { shiftsFor } from '@/lib/day';

/** Grid of slot times grouped by shift (the competitor's time picker). */
export function TimeGrid({
  restaurant,
  date,
  value,
  busy = [],
  onPick,
  onClose,
}: {
  restaurant: RestaurantDto;
  date: string;
  value: string;
  /** Bookings already on the chosen table(s): slots inside them are shown as taken. */
  busy?: Array<{ from: string; to: string; label: string }>;
  onPick: (time: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const shifts = shiftsFor(restaurant, date);
    const list = shifts.length
      ? shifts
      : [{ name: 'all', start: DateTime.fromISO(date, { zone: restaurant.timezone }).set({ hour: 8 }), end: DateTime.fromISO(date, { zone: restaurant.timezone }).set({ hour: 23, minute: 59 }) }];
    return list.map((s) => {
      const times: Array<{ time: string; taken: string | null }> = [];
      for (let at = s.start; at < s.end; at = at.plus({ minutes: restaurant.slotMinutes })) {
        const hit = busy.find((b) => at >= DateTime.fromISO(b.from) && at < DateTime.fromISO(b.to));
        times.push({ time: at.toFormat('HH:mm'), taken: hit?.label ?? null });
      }
      return { name: s.name, times };
    });
  }, [restaurant, date, busy]);
  const now = DateTime.now().setZone(restaurant.timezone);

  return (
    <Modal open nested onClose={onClose} title={t('reservation.selectTime')} size="md">
      {busy.length > 0 && (
        <div className="mb-3 rounded-lg bg-surface-2 p-2 text-sm">
          <div className="font-semibold">{t('reservation.tableTaken')}</div>
          <ul className="text-muted">
            {busy.map((b) => (
              <li key={b.from + b.label}>{b.label}</li>
            ))}
          </ul>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.name} className="mb-4">
          <div className="label">{t(`shift.${g.name}`, { defaultValue: g.name === 'all' ? '' : g.name })}</div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {g.times.map(({ time, taken }) => (
              <button
                key={time}
                type="button"
                disabled={!!taken}
                title={taken ?? undefined}
                onClick={() => onPick(time)}
                className={`h-11 rounded-lg text-[15px] font-semibold tabular-nums ${
                  time === value
                    ? 'bg-accent text-accent-ink'
                    : taken
                      ? 'cursor-not-allowed bg-transparent text-muted/50 line-through'
                      : time.endsWith(':00')
                        ? 'bg-surface-3'
                        : 'bg-surface-2'
                }`}
              >
                {time}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="text-sm text-accent" onClick={() => onPick(now.set({ minute: Math.floor(now.minute / 5) * 5 }).toFormat('HH:mm'))}>
        {t('common.today')} · {now.toFormat('HH:mm')}
      </button>
    </Modal>
  );
}
