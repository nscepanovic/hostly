import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import type { AdminMessageDto } from '@hostly/shared';
import { useAdminRestaurants, useMessages } from '../queries';
import { useDateTime } from '../ui';

const ICON = { sent: <CircleCheck size={15} className="text-ok" />, failed: <CircleAlert size={15} className="text-danger" />, queued: <Clock size={15} className="text-muted" /> };

export function MessagesTable({ rows, hideRestaurant }: { rows: AdminMessageDto[]; hideRestaurant?: boolean }) {
  const { t } = useTranslation();
  const fmt = useDateTime();
  if (!rows.length) return <p className="text-muted">{t('admin.noData')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted uppercase">
          <tr>
            <th className="py-2 pr-3">{t('admin.when')}</th>
            {!hideRestaurant && <th className="py-2 pr-3">{t('admin.restaurant')}</th>}
            <th className="py-2 pr-3">{t('admin.template')}</th>
            <th className="py-2 pr-3">{t('admin.recipient')}</th>
            <th className="py-2 pr-3">{t('admin.status')}</th>
            <th className="py-2">{t('admin.error')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className="border-t border-border/50">
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmt(m.createdAt)}</td>
              {!hideRestaurant && (
                <td className="py-2 pr-3">
                  <Link to={`/admin/restaurants/${m.restaurantId}`} className="text-accent hover:underline">
                    {m.restaurantName}
                  </Link>
                </td>
              )}
              <td className="py-2 pr-3">
                {m.templateKey} <span className="text-xs text-muted">{m.language.toUpperCase()}</span>
              </td>
              <td className="py-2 pr-3 text-muted">{m.recipient}</td>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-1">
                  {ICON[m.status as keyof typeof ICON]} {t(`reservation.messageStatus.${m.status}`)}
                </span>
              </td>
              <td className="max-w-64 truncate py-2 text-danger" title={m.error ?? ''}>
                {m.error}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmailsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const { data: restaurants = [] } = useAdminRestaurants();
  const { data = [] } = useMessages(status || undefined, restaurantId || undefined);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('admin.allStatuses')}</option>
          <option value="failed">{t('reservation.messageStatus.failed')}</option>
          <option value="sent">{t('reservation.messageStatus.sent')}</option>
          <option value="queued">{t('reservation.messageStatus.queued')}</option>
        </select>
        <select className="field w-auto max-w-sm" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
          <option value="">{t('admin.allRestaurants')}</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <section className="card p-4">
        <MessagesTable rows={data} hideRestaurant={!!restaurantId} />
      </section>
    </div>
  );
}
