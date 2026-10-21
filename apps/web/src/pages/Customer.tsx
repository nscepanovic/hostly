import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus } from 'lucide-react';
import type { CustomerDto } from '@hostly/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { qk, useRestaurant } from '@/lib/queries';
import { fmtDateTime } from '@/lib/time';
import { useUi } from '@/store/ui';
import { CustomerBadge } from '@/features/reservation/ReservationCard';
import { CustomerFields } from '@/features/customers/CustomerForm';

interface Visit {
  id: string;
  restaurant: string;
  arrivalAt: string;
  covers: number;
  status: string;
  tables: string[];
  spend: number | null;
}

export default function CustomerPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: restaurant } = useRestaurant();
  const { openReservation, newReservation } = useUi();
  const customer = useQuery({ queryKey: qk.customer(id), queryFn: () => api.get<CustomerDto>(`/customers/${id}`) });
  const visits = useQuery({ queryKey: [...qk.customer(id), 'visits'], queryFn: () => api.get<Visit[]>(`/customers/${id}/visits`) });
  const c = customer.data;
  if (!c || !restaurant) return <p className="p-6 text-muted">{t('common.loading')}</p>;
  const fmt = (iso: string) => fmtDateTime(iso, restaurant.timezone, i18n.language);
  const shared = restaurant.sharesGuestsWith.length > 0;
  const spent = (visits.data ?? []).filter((v) => v.spend !== null);
  const avgSpend = spent.length ? Math.round(spent.reduce((n, v) => n + v.spend!, 0) / spent.length) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <IconButton label={t('common.back')} onClick={() => navigate('/customers')}>
          <ArrowLeft size={22} />
        </IconButton>
        <h2 className="min-w-0 flex-1 truncate text-xl font-bold">{[c.lastName, c.firstName].filter(Boolean).join(' ') || '—'}</h2>
        <CustomerBadge type={c.type} />
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => newReservation({ firstName: c.firstName ?? undefined, phone: c.phone ?? undefined })}
        >
          <span className="hidden sm:inline">{t('topbar.newReservation')}</span>
        </Button>
      </div>
      <div className="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="card p-4">
          <h3 className="mb-3 font-semibold">{t('customers.profile')}</h3>
          <CustomerFields key={c.id + c.createdAt} customer={c} onSaved={() => undefined} />
        </section>
        <section className="card p-4">
          <div className="mb-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
            <Stat label={t('customers.visits')} value={c.stats.visits} />
            <Stat label={t('customers.cancellations')} value={c.stats.cancellations} />
            <Stat label={t('customers.noShows')} value={c.stats.noShows} warn={c.stats.noShows > 0} />
            <Stat label={t('customers.averageSpend')} value={(c.averageSpend ?? avgSpend)?.toLocaleString(i18n.language) ?? '—'} />
          </div>
          <h3 className="mb-2 font-semibold">{t('customers.history')}</h3>
          {!visits.data?.length ? (
            <p className="text-muted">{t('customers.noHistory')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted uppercase">
                <tr>
                  <th className="py-2">{t('customers.date')}</th>
                  {shared && <th className="py-2 pl-3">{t('customers.restaurant')}</th>}
                  <th className="py-2 text-right">{t('common.covers')}</th>
                  <th className="py-2 pl-3">{t('common.table')}</th>
                  <th className="py-2 text-right">{t('customers.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {visits.data.map((v) => (
                  <tr key={v.id} onClick={() => openReservation(v.id)} className="h-11 cursor-pointer border-t border-border/60 hover:bg-surface-2">
                    <td>
                      {fmt(v.arrivalAt)}
                      {v.status !== 'completed' && <span className="ml-2 text-xs text-muted">{t(`status.${v.status}`)}</span>}
                    </td>
                    {shared && <td className="pl-3">{v.restaurant}</td>}
                    <td className="text-right tabular-nums">{v.covers}</td>
                    <td className="pl-3">{v.tables.join(', ')}</td>
                    <td className="text-right tabular-nums">{v.spend?.toLocaleString(i18n.language) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2">
      <div className={`text-2xl font-bold tabular-nums ${warn ? 'text-warn' : ''}`}>{value}</div>
      <div className="text-[11px] text-muted uppercase">{label}</div>
    </div>
  );
}
