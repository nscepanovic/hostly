import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ExternalLink, Loader2, RotateCw } from 'lucide-react';
import type { ReceiptDto } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtMoney, fmtQty } from '@/lib/money';
import { fmtDateTime } from '@/lib/time';
import { useRestaurant } from '@/lib/queries';

/** One receipt: total, time, items and payments, with a retry while items are missing. */
export function ReceiptView({ receipt, compact = false }: { receipt: ReceiptDto; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant();
  const lang = i18n.language;
  const retry = useMutation({
    mutationFn: () => api.post<ReceiptDto>(`/receipts/${receipt.id}/retry`),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['receipts'] });
      if (r.status !== 'ready') toast.error(t('receipts.stillUnavailable'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const refund = receipt.transactionType === 'refund';
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`text-xl font-bold tabular-nums ${refund ? 'text-danger' : ''}`}>{fmtMoney(receipt.total, lang)}</span>
        {refund && <span className="rounded bg-danger/15 px-1.5 text-xs font-bold text-danger">{t('receipts.refund')}</span>}
        <span className="text-sm text-muted tabular-nums">{restaurant ? fmtDateTime(receipt.issuedAt, restaurant.timezone, lang) : ''}</span>
        <a href={receipt.verificationUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-text" title={t('receipts.verify')}>
          {receipt.invoiceNumber}
          <ExternalLink size={12} />
        </a>
      </div>
      {receipt.status !== 'ready' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-warn/15 px-3 py-2 text-sm text-warn">
          {receipt.status === 'pending' ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
          <span className="flex-1">{t(receipt.status === 'pending' ? 'receipts.loadingItems' : 'receipts.itemsLater')}</span>
          <Button size="sm" icon={<RotateCw size={14} />} disabled={retry.isPending} onClick={() => retry.mutate()}>
            {t('receipts.retry')}
          </Button>
        </div>
      )}
      {receipt.items.length > 0 && (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {(compact ? receipt.items.slice(0, 4) : receipt.items).map((i, n) => (
              <tr key={n} className="border-t border-border/60">
                <td className="py-1 pr-2">{i.name}</td>
                <td className="py-1 pr-2 text-right text-muted tabular-nums whitespace-nowrap">
                  {fmtQty(i.quantity, lang)}
                  {i.unit ? ` ${i.unit}` : ''}
                </td>
                <td className="py-1 text-right tabular-nums whitespace-nowrap">{fmtMoney(i.total, lang)}</td>
              </tr>
            ))}
            {compact && receipt.items.length > 4 && (
              <tr className="border-t border-border/60">
                <td colSpan={3} className="py-1 text-muted">
                  {t('receipts.moreItems', { count: receipt.items.length - 4 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {receipt.payments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
          {receipt.payments.map((p) => (
            <span key={p.method} className="rounded-full bg-surface-3 px-2 py-0.5">
              {t(`receipts.payment.${p.method}`)} · {fmtMoney(p.amount, lang)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
