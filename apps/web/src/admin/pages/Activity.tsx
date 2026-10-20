import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { AdminActivityDto } from '@hostly/shared';
import { useActivity, useAdminRestaurants } from '../queries';
import { useDateTime } from '../ui';

export function ActivityTable({ rows, hideRestaurant }: { rows: AdminActivityDto[]; hideRestaurant?: boolean }) {
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
            <th className="py-2 pr-3">{t('admin.who')}</th>
            <th className="py-2">{t('admin.what')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t border-border/50">
              <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fmt(a.at)}</td>
              {!hideRestaurant && (
                <td className="py-2 pr-3">
                  <Link to={`/admin/restaurants/${a.restaurantId}`} className="text-accent hover:underline">
                    {a.restaurantName}
                  </Link>
                </td>
              )}
              <td className="py-2 pr-3">{a.userName ?? <span className="text-muted">{t('admin.system_actor')}</span>}</td>
              <td className="py-2">
                <code className="rounded bg-surface-2 px-1.5 text-xs">{a.entity}</code> {a.action}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityPage() {
  const { t } = useTranslation();
  const [restaurantId, setRestaurantId] = useState('');
  const { data: restaurants = [] } = useAdminRestaurants();
  const { data = [] } = useActivity(restaurantId || undefined);
  return (
    <div className="flex flex-col gap-3">
      <select className="field w-auto max-w-sm" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
        <option value="">{t('admin.allRestaurants')}</option>
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <section className="card p-4">
        <ActivityTable rows={data} hideRestaurant={!!restaurantId} />
      </section>
    </div>
  );
}
