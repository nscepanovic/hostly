import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AreaDto, TableDto } from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

/** Manual multi-select of tables; tables busy in the window are shown disabled. */
export function TablePicker({
  tables,
  areas,
  selected,
  arrivalAt,
  departureAt,
  excludeReservationId,
  onChange,
  onClose,
}: {
  tables: TableDto[];
  areas: AreaDto[];
  selected: string[];
  arrivalAt: string | null;
  departureAt: string | null;
  excludeReservationId?: string;
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const free = useQuery({
    queryKey: ['free-tables', arrivalAt, departureAt, excludeReservationId],
    queryFn: () =>
      api.get<string[]>('/reservations/free-tables', { arrivalAt: arrivalAt!, departureAt: departureAt!, excludeReservationId }),
    enabled: !!arrivalAt && !!departureAt,
  });
  const freeSet = free.data ? new Set(free.data) : null;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Modal open nested onClose={onClose} title={t('reservation.pickManually')} size="md">
      {areas.map((a) => (
        <div key={a.id} className="mb-4">
          <div className="label">{a.name}</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {tables
              .filter((tb) => tb.areaId === a.id)
              .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }))
              .map((tb) => {
                const busy = freeSet ? !freeSet.has(tb.id) && !selected.includes(tb.id) : false;
                const on = selected.includes(tb.id);
                return (
                  <button
                    key={tb.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(tb.id)}
                    className={`flex h-14 flex-col items-center justify-center rounded-xl border ${
                      on ? 'border-accent bg-accent/20' : 'border-border bg-surface-2'
                    } disabled:opacity-30`}
                  >
                    <span className="font-semibold">{tb.label}</span>
                    <span className="text-xs text-muted">
                      {tb.minSeats}-{tb.maxSeats}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <Button variant="primary" className="w-full" onClick={onClose}>
        {t('common.confirm')}
      </Button>
    </Modal>
  );
}
