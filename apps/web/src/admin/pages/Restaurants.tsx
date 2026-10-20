import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link2, Plus, Search, Wifi } from 'lucide-react';
import type { AdminRestaurantDetail, AdminRestaurantRow } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { aq, useAdminRestaurants } from '../queries';
import { StatusBadge, useAgo } from '../ui';

export function RestaurantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ago = useAgo();
  const { data = [] } = useAdminRestaurants();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? data.filter((r) => r.name.toLowerCase().includes(s) || r.slug.includes(s)) : data;
  }, [data, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="field pl-10" placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreating(true)}>
          {t('admin.newRestaurant')}
        </Button>
      </div>

      {/* Phones: cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <button key={r.id} type="button" onClick={() => navigate(`/admin/restaurants/${r.id}`)} className="card p-3 text-left">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate font-semibold">{r.name}</span>
              <StatusBadge suspended={!!r.suspendedAt} />
            </div>
            <div className="mt-1 text-sm text-muted">
              {r.reservations30d} {t('admin.reservations').toLowerCase()} · {r.staff} {t('admin.staff').toLowerCase()} · {ago(r.lastActivityAt)}
            </div>
          </button>
        ))}
      </div>

      {/* Tablets and up: table */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted uppercase">
            <tr>
              <th className="px-3 py-2">{t('admin.name')}</th>
              <th className="px-3 py-2">{t('admin.status')}</th>
              <th className="px-3 py-2 text-right">{t('admin.reservations30d')}</th>
              <th className="px-3 py-2 text-right">{t('admin.staff')}</th>
              <th className="px-3 py-2 text-right">{t('admin.tables')}</th>
              <th className="px-3 py-2 text-right">{t('admin.guests')}</th>
              <th className="px-3 py-2 text-right">{t('admin.devicesShort')}</th>
              <th className="px-3 py-2">{t('admin.lastActivity')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/admin/restaurants/${r.id}`)} className="h-14 cursor-pointer border-b border-border/50 last:border-0 hover:bg-surface-2">
                <td className="px-3">
                  <div className="font-semibold">{r.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted">
                    /{r.slug}
                    {r.sharesGuestsWith.length > 0 && (
                      <span className="inline-flex items-center gap-0.5" title={r.sharesGuestsWith.map((x) => x.name).join(', ')}>
                        · <Link2 size={12} /> {r.sharesGuestsWith.length}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3">
                  <StatusBadge suspended={!!r.suspendedAt} />
                </td>
                <td className="px-3 text-right tabular-nums">{r.reservations30d}</td>
                <td className="px-3 text-right tabular-nums">{r.staff}</td>
                <td className="px-3 text-right tabular-nums">{r.tables}</td>
                <td className="px-3 text-right tabular-nums">{r.guests}</td>
                <td className="px-3 text-right tabular-nums">
                  <span className={`inline-flex items-center gap-1 ${r.connectedDevices ? 'text-ok' : 'text-muted'}`}>
                    <Wifi size={14} /> {r.connectedDevices}
                  </span>
                </td>
                <td className="px-3 text-muted">{ago(r.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-muted">{t('admin.noData')}</p>}
      </div>
      {creating && <CreateRestaurant restaurants={data} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/admin/restaurants/${id}`)} />}
    </div>
  );
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

function CreateRestaurant({ restaurants, onClose, onCreated }: { restaurants: AdminRestaurantRow[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', slug: '', ownerName: '', ownerEmail: '', ownerPassword: '', timezone: 'Europe/Belgrade', language: 'sr', shareGuestsWith: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const create = useMutation({
    mutationFn: () => api.post<AdminRestaurantDetail>('/admin/restaurants', { ...f, shareGuestsWith: f.shareGuestsWith || undefined }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: aq.restaurants });
      void qc.invalidateQueries({ queryKey: aq.overview });
      onCreated(r.id);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  const field = (k: keyof typeof f, label: string, type = 'text', extra: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field"
        type={type}
        required
        value={f[k]}
        onChange={(e) => {
          const v = e.target.value;
          setF((x) => ({ ...x, [k]: v, ...(k === 'name' && !slugTouched ? { slug: slugify(v) } : {}) }));
          if (k === 'slug') setSlugTouched(true);
        }}
        {...extra}
      />
    </label>
  );
  return (
    <Modal open onClose={onClose} title={t('admin.newRestaurant')} size="md">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {field('name', t('admin.name'))}
        {field('slug', t('admin.slug'), 'text', { pattern: '[a-z0-9]([a-z0-9-]*[a-z0-9])?' })}
        {field('ownerName', t('admin.ownerName'))}
        {field('ownerEmail', t('admin.ownerEmail'), 'email')}
        {field('ownerPassword', t('admin.ownerPassword'), 'password', { minLength: 8, autoComplete: 'new-password' })}
        {field('timezone', t('admin.timezone'))}
        <label className="block">
          <span className="label">{t('admin.language')}</span>
          <select className="field" value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
            <option value="sr">{t('language.sr')}</option>
            <option value="en">{t('language.en')}</option>
          </select>
        </label>
        <label className="block">
          <span className="label">{t('admin.shareGuestsWith')}</span>
          <select className="field" value={f.shareGuestsWith} onChange={(e) => setF({ ...f, shareGuestsWith: e.target.value })}>
            <option value="">{t('admin.noSharing')}</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t('admin.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
