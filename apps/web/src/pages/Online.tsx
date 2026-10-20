import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import type { OnlineSettings, RestaurantDto } from '@hostly/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { qk, useRestaurant } from '@/lib/queries';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Num({ label, value, onChange, nullable }: { label: string; value: number | null; onChange: (v: number | null) => void; nullable?: boolean }) {
  const { t } = useTranslation();
  return (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <input
        className="field tabular-nums"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={nullable ? t('online.unlimited') : ''}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? (nullable ? null : 0) : Number(e.target.value))}
      />
    </label>
  );
}

export default function OnlinePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant();
  const [s, setS] = useState<OnlineSettings | null>(null);
  const [blocked, setBlocked] = useState('');
  useEffect(() => {
    if (restaurant && !s) setS(restaurant.onlineSettings);
  }, [restaurant, s]);

  const save = useMutation({
    mutationFn: () => api.put<RestaurantDto>('/restaurant/online', s),
    onSuccess: (r) => {
      qc.setQueryData(qk.restaurant, r);
      toast.success(t('common.saved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!restaurant || !s) return null;
  const set = <K extends keyof OnlineSettings>(k: K, v: OnlineSettings[K]) => setS({ ...s, [k]: v });
  const link = `${window.location.origin}/book/${restaurant.slug}`;
  const embed = `<iframe src="${link}?embed=1" style="width:100%;max-width:520px;height:760px;border:0" loading="lazy" title="${restaurant.name}"></iframe>`;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast.success(t('online.copied')));
  };
  const shiftNames = [...new Set(Object.values(restaurant.openingHours).flatMap((list) => (list ?? []).map((x) => x.name)))];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-3 pb-24">
        <Section title={t('online.publicLink')}>
          <div className="flex items-center gap-2">
            <input className="field min-w-0 flex-1" readOnly value={link} onFocus={(e) => e.target.select()} />
            <IconButton label={t('online.copy')} className="border border-border" onClick={() => copy(link)}>
              <Copy size={18} />
            </IconButton>
            <a href={link} target="_blank" rel="noreferrer" className="flex h-11 w-11 items-center justify-center rounded-lg border border-border" aria-label={t('online.open')}>
              <ExternalLink size={18} />
            </a>
          </div>
          <span className="label mt-3">{t('online.embed')}</span>
          <div className="flex items-start gap-2">
            <textarea className="field min-w-0 flex-1 font-mono text-xs" rows={3} readOnly value={embed} onFocus={(e) => e.target.select()} />
            <IconButton label={t('online.copy')} className="border border-border" onClick={() => copy(embed)}>
              <Copy size={18} />
            </IconButton>
          </div>
        </Section>

        <Section title={t('online.title')}>
          <label className="mb-4 flex h-11 items-center gap-3">
            <input type="checkbox" className="h-6 w-6" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <span className="font-medium">{t('online.enabled')}</span>
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Num label={t('online.maxPartySize')} value={s.maxPartySize} onChange={(v) => set('maxPartySize', v ?? 1)} />
            <Num label={t('online.slotMinutes')} value={s.slotMinutes} onChange={(v) => set('slotMinutes', v ?? 15)} />
            <Num label={t('online.leadTime')} value={s.leadTimeMinutes} onChange={(v) => set('leadTimeMinutes', v ?? 0)} />
            <Num label={t('online.daysAhead')} value={s.daysAhead} onChange={(v) => set('daysAhead', v ?? 1)} />
            <Num label={t('online.lastArrival')} value={s.lastArrivalBeforeCloseMinutes} onChange={(v) => set('lastArrivalBeforeCloseMinutes', v ?? 0)} />
            <Num label={t('online.pacingReservations')} value={s.pacingMaxReservationsPerSlot} nullable onChange={(v) => set('pacingMaxReservationsPerSlot', v)} />
            <Num label={t('online.pacingCovers')} value={s.pacingMaxCoversPerSlot} nullable onChange={(v) => set('pacingMaxCoversPerSlot', v)} />
          </div>
        </Section>

        <Section title={t('online.durations')}>
          <div className="flex flex-col gap-2">
            {s.durations.map((d, i) => (
              <div key={i} className="flex items-end gap-2">
                <Num
                  label={t('online.upToCovers')}
                  value={d.upToCovers}
                  onChange={(v) => set('durations', s.durations.map((x, j) => (j === i ? { ...x, upToCovers: v ?? 1 } : x)))}
                />
                <Num
                  label={t('online.minutes')}
                  value={d.minutes}
                  onChange={(v) => set('durations', s.durations.map((x, j) => (j === i ? { ...x, minutes: v ?? 15 } : x)))}
                />
                <IconButton label={t('common.delete')} onClick={() => set('durations', s.durations.filter((_, j) => j !== i))}>
                  <Trash2 size={18} />
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              icon={<Plus size={16} />}
              className="self-start"
              onClick={() => set('durations', [...s.durations, { upToCovers: (s.durations.at(-1)?.upToCovers ?? 0) + 2, minutes: 120 }])}
            >
              {t('common.add')}
            </Button>
          </div>
        </Section>

        <Section title={t('online.shiftCapacity')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shiftNames.map((name) => (
              <Num
                key={name}
                label={t(`shift.${name}`, { defaultValue: name })}
                value={s.shiftCapacity[name] ?? null}
                nullable
                onChange={(v) => {
                  const next = { ...s.shiftCapacity };
                  if (v === null) delete next[name];
                  else next[name] = v;
                  set('shiftCapacity', next);
                }}
              />
            ))}
          </div>
        </Section>

        <Section title={t('online.blockedDates')}>
          <div className="mb-2 flex flex-wrap gap-2">
            {s.blockedDates.map((d) => (
              <button
                key={d}
                type="button"
                className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-3 px-3 text-sm"
                onClick={() => set('blockedDates', s.blockedDates.filter((x) => x !== d))}
              >
                {d} <X size={14} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="field w-auto" type="date" value={blocked} onChange={(e) => setBlocked(e.target.value)} />
            <Button
              disabled={!blocked}
              onClick={() => {
                if (!s.blockedDates.includes(blocked)) set('blockedDates', [...s.blockedDates, blocked].sort());
                setBlocked('');
              }}
            >
              {t('common.add')}
            </Button>
          </div>
        </Section>

        <Section title={`${t('online.instagram')} · ${t('online.website')}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">{t('online.instagram')}</span>
              <input className="field" type="url" value={s.instagramUrl ?? ''} onChange={(e) => set('instagramUrl', e.target.value || null)} />
            </label>
            <label>
              <span className="label">{t('online.website')}</span>
              <input className="field" type="url" value={s.websiteUrl ?? ''} onChange={(e) => set('websiteUrl', e.target.value || null)} />
            </label>
            <label className="sm:col-span-2">
              <span className="label">{t('online.intro')}</span>
              <textarea className="field" rows={3} value={s.intro ?? ''} onChange={(e) => set('intro', e.target.value || null)} />
            </label>
          </div>
        </Section>
      </div>
      <div className="safe-bottom fixed right-4 bottom-20 z-10 md:bottom-4">
        <Button variant="primary" size="lg" onClick={() => save.mutate()} disabled={save.isPending} className="shadow-xl">
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
