import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { Armchair, Ban, CheckCheck, Pencil, MoveRight, Plus, ReceiptText, Undo2, UserX, Footprints } from 'lucide-react';
import { formatPhone, type ReservationDto, type ReservationStatus, type TableDto } from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { confirmDialog } from '@/components/ui/Confirm';
import { guestName } from '@/lib/day';
import { fmtTime } from '@/lib/time';
import type { TableStatus } from '@/lib/tableState';
import { useUi } from '@/store/ui';
import { useReceiptUi } from '@/store/receipts';
import { CustomerBadge } from '../reservation/ReservationCard';
import { useReservationActions } from '../reservation/actions';

function Action({ icon, label, onClick, tone = 'default' }: { icon: ReactNode; label: string; onClick: () => void; tone?: 'default' | 'ok' | 'danger' | 'warn' }) {
  const tones = {
    default: 'bg-surface-2 border border-border',
    ok: 'bg-ok text-white',
    danger: 'bg-danger/15 text-danger border border-danger/30',
    warn: 'bg-warn/15 text-warn border border-warn/30',
  };
  return (
    <button type="button" onClick={onClick} className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold active:scale-95 ${tones[tone]}`}>
      {icon}
      {label}
    </button>
  );
}

/**
 * End for a walk-in on a table booked later: 15 minutes before that booking when it is
 * within a normal stay (3 hours); otherwise no end, so the usual estimate applies.
 */
function walkInEnd(status: TableStatus | undefined, timezone: string): string | undefined {
  if (!status?.freeUntil) return undefined;
  const end = DateTime.fromISO(status.freeUntil).setZone(timezone).minus({ minutes: 15 });
  const minutes = end.diffNow('minutes').minutes;
  return minutes > 30 && minutes < 180 ? end.toFormat("yyyy-LL-dd'T'HH:mm") : undefined;
}

export function TablePopover({
  table,
  status,
  timezone,
  onClose,
  onMove,
}: {
  table: TableDto;
  status: TableStatus | undefined;
  timezone: string;
  onClose: () => void;
  onMove: (r: ReservationDto) => void;
}) {
  const { t } = useTranslation();
  const { openReservation, newReservation } = useUi();
  const actions = useReservationActions();
  const r = status?.reservation ?? null;

  const set = async (s: ReservationStatus, confirm?: string) => {
    if (!r) return;
    if (confirm && !(await confirmDialog(confirm, { danger: true })).ok) return;
    actions.status.mutate({ id: r.id, status: s });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${table.label} · ${table.minSeats}-${table.maxSeats}`} size="sm">
      {r ? (
        <div className="mb-4 rounded-xl border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{guestName(r)}</span>
            <CustomerBadge type={r.customerType} />
            <span className="ml-auto rounded-md bg-surface-3 px-2 py-0.5 text-sm">{t(`status.${r.status}`)}</span>
          </div>
          <div className="mt-1 text-muted tabular-nums">
            {fmtTime(r.arrivalAt, timezone)}{r.departureEstimated ? ' – ~' : '–'}
            {fmtTime(r.departureAt, timezone)} · {r.covers} {t('common.covers').toLowerCase()}
            {r.phone && ` · ${formatPhone(r.phone)}`}
          </div>
          {(r.notes || r.tags.length > 0 || r.dietary.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1 text-sm">
              {[...r.tags, ...r.dietary].map((tag) => (
                <span key={tag} className="rounded bg-surface-3 px-2">
                  {tag}
                </span>
              ))}
              {r.notes && <span className="w-full text-muted italic">{r.notes}</span>}
            </div>
          )}
        </div>
      ) : (
        <p className="mb-4 text-muted">
          {status?.freeUntil ? t('floor.freeUntil', { time: fmtTime(status.freeUntil, timezone) }) : t('floor.tableFree')}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {r?.status === 'confirmed' || r?.status === 'pending' ? (
          <>
            {r.status === 'confirmed' && <Action tone="ok" icon={<Armchair size={22} />} label={t('actions.seat')} onClick={() => set('seated')} />}
            {r.status === 'confirmed' && (
              <Action tone="warn" icon={<UserX size={22} />} label={t('actions.noShow')} onClick={() => set('no_show', t('actions.confirmNoShow'))} />
            )}
            <Action tone="danger" icon={<Ban size={22} />} label={t('common.cancel')} onClick={() => set('cancelled', t('actions.confirmCancel'))} />
          </>
        ) : null}
        {r?.status === 'seated' && (
          <>
            <Action tone="ok" icon={<CheckCheck size={22} />} label={t('actions.complete')} onClick={() => set('completed')} />
            <Action icon={<Undo2 size={22} />} label={t('actions.unseat')} onClick={() => set('confirmed')} />
          </>
        )}
        {r?.status === 'completed' && <Action icon={<Undo2 size={22} />} label={t('actions.reopen')} onClick={() => set('seated')} />}
        {(r?.status === 'seated' || r?.status === 'completed') && (
          <Action
            icon={<ReceiptText size={22} />}
            label={t('receipts.scan')}
            onClick={() => {
              useReceiptUi.getState().openScanner({ reservationId: r.id, guestName: guestName(r) });
              onClose();
            }}
          />
        )}
        {r && (
          <>
            <Action
              icon={<Pencil size={22} />}
              label={t('actions.edit')}
              onClick={() => {
                openReservation(r.id);
                onClose();
              }}
            />
            {r.status !== 'completed' && (
              <Action
                icon={<MoveRight size={22} />}
                label={t('floor.move')}
                onClick={() => {
                  onMove(r);
                  onClose();
                }}
              />
            )}
          </>
        )}
        {(!r || r.status === 'completed') && (
          <Action
            tone="ok"
            icon={<Footprints size={22} />}
            label={t('topbar.walkIn')}
            onClick={() => {
              newReservation({
                tableIds: [table.id],
                status: 'seated',
                source: 'walk_in',
                covers: table.minSeats,
                arrivalTime: DateTime.now().setZone(timezone).toFormat('HH:mm'),
                // Walk-ins on a table booked later must leave before that booking.
                endAt: walkInEnd(status, timezone),
              });
              onClose();
            }}
          />
        )}
        {/* A table takes many bookings a day: a new one is always possible (busy times are greyed in the time picker). */}
        <Action
          icon={<Plus size={22} />}
          label={t('topbar.newReservation')}
          onClick={() => {
            newReservation({ tableIds: [table.id], covers: table.minSeats });
            onClose();
          }}
        />
      </div>

      {status && status.upcoming.length > 0 && (
        <div className="mt-4">
          <div className="label">{t('floor.comingUp')}</div>
          <div className="flex flex-col gap-1">
            {status.upcoming.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  openReservation(u.id);
                  onClose();
                }}
                className="flex h-11 items-center gap-3 rounded-lg bg-surface-2 px-3 text-left"
              >
                <b className="tabular-nums">
                  {fmtTime(u.arrivalAt, timezone)}{u.departureEstimated ? ' – ~' : '–'}
                  {fmtTime(u.departureAt, timezone)}
                </b>
                <span className="flex-1 truncate">{guestName(u)}</span>
                <span className="text-muted">{u.covers}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
