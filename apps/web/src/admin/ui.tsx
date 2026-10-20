import type { ReactNode } from 'react';
import { DateTime } from 'luxon';
import { CircleAlert, CircleCheck, CirclePause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { luxonLocale } from '@/i18n';

/** A headline number with its label (and optional detail line). */
export function Stat({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'warn' | 'bad' }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      {detail && <div className="mt-0.5 text-sm text-muted">{detail}</div>}
    </div>
  );
}

/** Status always carries an icon and a word, never colour alone. */
export function StatusBadge({ suspended }: { suspended: boolean }) {
  const { t } = useTranslation();
  return suspended ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
      <CirclePause size={13} /> {t('admin.suspended')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-xs font-semibold text-ok">
      <CircleCheck size={13} /> {t('admin.active')}
    </span>
  );
}

export function HealthLine({ ok, label, value }: { ok: boolean; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {ok ? <CircleCheck size={16} className="text-ok" /> : <CircleAlert size={16} className="text-danger" />}
      <span className="text-muted">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function useAgo() {
  const { t, i18n } = useTranslation();
  return (iso: string | null) => (iso ? DateTime.fromISO(iso).setLocale(luxonLocale(i18n.language)).toRelative() : t('admin.never'));
}

export function useDateTime() {
  const { i18n } = useTranslation();
  return (iso: string) => DateTime.fromISO(iso).setLocale(luxonLocale(i18n.language)).toFormat('dd.LL.yyyy HH:mm');
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export function duration(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
