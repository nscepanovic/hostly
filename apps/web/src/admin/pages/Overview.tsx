import { useTranslation } from 'react-i18next';
import { BarChart } from '../BarChart';
import { useOverview } from '../queries';
import { duration, HealthLine, pct, Stat } from '../ui';

export function OverviewPage() {
  const { t } = useTranslation();
  const { data: o } = useOverview();
  if (!o) return <p className="p-6 text-muted">{t('common.loading')}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('admin.restaurantsTotal')} value={o.restaurants.total} detail={t('admin.suspendedCount', { count: o.restaurants.suspended })} />
        <Stat label={t('admin.active7d')} value={o.restaurants.activeLast7d} />
        <Stat label={t('admin.devices')} value={o.connectedDevices} />
        <Stat label={t('admin.pendingOnline')} value={o.pendingOnline} tone={o.pendingOnline > 20 ? 'warn' : undefined} />
        <Stat label={t('admin.reservations24h')} value={o.reservations.last24h} detail={`${t('admin.reservations7d')}: ${o.reservations.last7d}`} />
        <Stat label={t('admin.reservations30d')} value={o.reservations.last30d} detail={`${t('admin.covers30d')}: ${o.reservations.covers30d}`} />
        <Stat label={t('admin.onlineShare')} value={pct(o.reservations.onlineShare30d)} detail={`${t('admin.noShowRate')}: ${pct(o.reservations.noShowRate30d)}`} />
        <Stat
          label={t('admin.emails24h')}
          value={o.emails24h.sent + o.emails24h.failed}
          detail={t('admin.emailsSentFailed', o.emails24h)}
          tone={o.emails24h.failed > 0 ? 'bad' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BarChart data={o.perDay} title={t('admin.chartTitle')} />
        <section className="card p-4">
          <h3 className="mb-2 font-semibold">{t('admin.system')}</h3>
          <HealthLine ok={o.system.dbOk} label={t('admin.database')} value={o.system.dbOk ? t('admin.dbOk', { ms: o.system.dbLatencyMs }) : t('admin.dbDown')} />
          <HealthLine ok label={t('admin.uptime')} value={duration(o.system.uptimeSec)} />
          <HealthLine ok={o.system.memoryMb < 450} label={t('admin.memory')} value={`${o.system.memoryMb} MB`} />
          <HealthLine ok label={t('admin.version')} value={`${o.system.version} · Node ${o.system.node}`} />
          <HealthLine ok label={t('admin.staff')} value={o.staffUsers} />
          <HealthLine ok label={t('admin.guests')} value={o.guests} />
          <p className="mt-3 text-xs text-muted">{t('admin.privacyNote')}</p>
        </section>
      </div>
    </div>
  );
}
