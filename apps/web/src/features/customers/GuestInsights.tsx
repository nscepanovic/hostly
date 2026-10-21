import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import type { CustomerInsights } from '@hostly/shared';
import { api } from '@/lib/api';
import { fmtMoney, fmtQty } from '@/lib/money';

/** What the guest usually orders and spends, from scanned receipts. */
export function GuestInsights({ customerId }: { customerId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data: x } = useQuery({
    queryKey: ['analytics', 'customer', customerId],
    queryFn: () => api.get<CustomerInsights>(`/analytics/customers/${customerId}`),
  });
  if (!x || x.receipts === 0) return null;
  const money = (v: number | null) => (v === null ? '—' : fmtMoney(v, lang, 0));
  const topPayment = x.payments[0];
  return (
    <div className="mb-4 rounded-xl border border-border p-3">
      <h3 className="mb-2 flex items-center gap-2 font-semibold">
        <Heart size={16} className="text-accent" />
        {t('insights.title')}
      </h3>
      <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface-2 p-2">
          <dd className="font-bold tabular-nums">{money(x.totalSpent)}</dd>
          <dt className="text-[11px] text-muted uppercase">{t('insights.total')}</dt>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dd className="font-bold tabular-nums">{money(x.averagePerVisit)}</dd>
          <dt className="text-[11px] text-muted uppercase">{t('insights.perVisit')}</dt>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <dd className="font-bold tabular-nums">{money(x.averagePerCover)}</dd>
          <dt className="text-[11px] text-muted uppercase">{t('insights.perGuest')}</dt>
        </div>
      </dl>
      {x.favoriteItems.length > 0 && (
        <>
          <div className="label">{t('insights.favorites')}</div>
          <ul className="flex flex-wrap gap-2">
            {x.favoriteItems.map((i) => (
              <li key={i.name} className="rounded-full bg-accent/12 px-3 py-1 text-sm" title={`${t('insights.times', { count: i.times })} · ${fmtMoney(i.total, lang)}`}>
                {i.name} <span className="text-muted tabular-nums">{fmtQty(i.quantity, lang)}×</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {topPayment && <p className="mt-3 text-sm text-muted">{t('insights.usuallyPays', { method: t(`receipts.payment.${topPayment.method}`).toLowerCase() })}</p>}
    </div>
  );
}
