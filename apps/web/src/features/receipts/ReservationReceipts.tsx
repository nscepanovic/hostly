import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ReceiptText } from 'lucide-react';
import type { ReceiptDto } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import { useReceiptUi } from '@/store/receipts';
import { ReceiptView } from './ReceiptView';

export const reservationReceiptsKey = (id: string) => ['receipts', 'reservation', id];

/** Receipts of one reservation, with a scan button (also for adding one later, from history). */
export function ReservationReceipts({ reservationId, guestName }: { reservationId: string; guestName?: string }) {
  const { t, i18n } = useTranslation();
  const openScanner = useReceiptUi((s) => s.openScanner);
  const { data: receipts = [] } = useQuery({
    queryKey: reservationReceiptsKey(reservationId),
    queryFn: () => api.get<ReceiptDto[]>('/receipts', { reservationId }),
  });
  const total = receipts.reduce((s, r) => s + r.total, 0);
  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="label mb-0 flex-1">
          {t('receipts.title')}
          {receipts.length > 0 && ` · ${fmtMoney(total, i18n.language)}`}
        </span>
        <Button size="sm" icon={<ReceiptText size={16} />} onClick={() => openScanner({ reservationId, guestName })}>
          {t('receipts.scan')}
        </Button>
      </div>
      {receipts.length === 0 ? (
        <p className="text-sm text-muted">{t('receipts.none')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {receipts.map((r) => (
            <ReceiptView key={r.id} receipt={r} compact />
          ))}
        </div>
      )}
    </div>
  );
}
