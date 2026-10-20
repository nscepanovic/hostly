import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink, KeyRound, Plus } from 'lucide-react';
import type { AdminRestaurantDetail, Role } from '@hostly/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/Confirm';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { BarChart } from '../BarChart';
import { aq, useAdminRestaurant, useAdminRestaurants } from '../queries';
import { ActivityTable } from './Activity';
import { MessagesTable } from './Emails';
import { Stat, StatusBadge, useAgo, useDateTime } from '../ui';

export function RestaurantDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const ago = useAgo();
  const fmt = useDateTime();
  const { data: r } = useAdminRestaurant(id);
  const { data: all = [] } = useAdminRestaurants();
  const [shareWith, setShareWith] = useState('');
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = (next?: AdminRestaurantDetail) => {
    if (next) qc.setQueryData(aq.restaurant(id), next);
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const onError = (err: unknown) => toast.error(errorMessage(err));
  const suspend = useMutation({
    mutationFn: (suspended: boolean) => api.patch<AdminRestaurantDetail>(`/admin/restaurants/${id}`, { suspended }),
    onSuccess: refresh,
    onError,
  });
  const share = useMutation({
    mutationFn: (withRestaurantId: string) =>
      api.post<{ moved: number; merged: number; restaurant: AdminRestaurantDetail }>(`/admin/restaurants/${id}/share-guests`, { withRestaurantId }),
    onSuccess: (res) => {
      refresh(res.restaurant);
      setShareWith('');
      toast.success(t('admin.shareResult', res));
    },
    onError,
  });
  const unshare = useMutation({
    mutationFn: () => api.post<{ restaurant: AdminRestaurantDetail }>(`/admin/restaurants/${id}/unshare-guests`),
    onSuccess: (res) => refresh(res.restaurant),
    onError,
  });

  if (!r) return <p className="p-6 text-muted">{t('common.loading')}</p>;
  const suspended = !!r.suspendedAt;
  const others = all.filter((x) => x.id !== r.id && !r.sharesGuestsWith.some((s) => s.id === x.id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/admin/restaurants" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-2" aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </Link>
        <h2 className="text-2xl font-bold">{r.name}</h2>
        <StatusBadge suspended={suspended} />
        <div className="flex-1" />
        <a href={`/book/${r.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm">
          <ExternalLink size={16} /> {t('admin.bookingPage')}
        </a>
        <Button
          variant={suspended ? 'primary' : 'danger'}
          disabled={suspend.isPending}
          onClick={async () => {
            const msg = suspended ? t('admin.confirmReactivate', { name: r.name }) : t('admin.confirmSuspend', { name: r.name });
            if ((await confirmDialog(msg, { danger: !suspended })).ok) suspend.mutate(!suspended);
          }}
        >
          {suspended ? t('admin.reactivate') : t('admin.suspend')}
        </Button>
      </div>
      <p className="-mt-2 text-sm text-muted">
        /{r.slug} · {r.timezone} · {t('admin.created')} {fmt(r.createdAt)} · {t('admin.lastActivity')}: {ago(r.lastActivityAt)}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={t('admin.reservations30d')} value={r.reservations30d} />
        <Stat label={t('admin.covers30d')} value={r.covers30d} />
        <Stat label={t('admin.guests')} value={r.guests} />
        <Stat label={t('admin.tables')} value={r.tables} />
        <Stat label={t('admin.devicesShort')} value={r.connectedDevices} />
      </div>

      <BarChart data={r.perDay} title={t('admin.chartTitle')} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">{t('admin.staffTitle')}</h3>
            <Button size="sm" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
              {t('admin.addUser')}
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            {r.users.map((u) => (
              <div key={u.id} className="flex min-h-12 items-center gap-3 rounded-lg bg-surface-2 px-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </div>
                <span className="rounded bg-surface-3 px-2 text-xs">{t(`settings.role.${u.role}`)}</span>
                <IconButton label={t('admin.resetPassword')} onClick={() => setResetFor({ id: u.id, name: u.name })}>
                  <KeyRound size={18} />
                </IconButton>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h3 className="mb-2 font-semibold">{t('admin.guestSharing')}</h3>
          {r.sharesGuestsWith.length ? (
            <>
              <p className="mb-3">
                {t('admin.sharedWith')}: <b>{r.sharesGuestsWith.map((s) => s.name).join(', ')}</b>
              </p>
              <Button
                disabled={unshare.isPending}
                onClick={async () => (await confirmDialog(t('admin.confirmUnshare', { name: r.name }), { danger: true })).ok && unshare.mutate()}
              >
                {t('admin.unshare')}
              </Button>
            </>
          ) : (
            <p className="mb-3 text-muted">{t('admin.private')}</p>
          )}
          {others.length > 0 && (
            <div className="mt-3 flex gap-2">
              <select className="field flex-1" value={shareWith} onChange={(e) => setShareWith(e.target.value)} aria-label={t('admin.shareWith')}>
                <option value="">{t('admin.shareWith')}…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={!shareWith || share.isPending}
                onClick={async () => {
                  const other = others.find((o) => o.id === shareWith)!;
                  if ((await confirmDialog(t('admin.confirmShare', { a: r.name, b: other.name }), { danger: true })).ok) share.mutate(shareWith);
                }}
              >
                {t('admin.share')}
              </Button>
            </div>
          )}
        </section>
      </div>

      <section className="card p-4">
        <h3 className="mb-2 font-semibold">{t('admin.recentActivity')}</h3>
        <ActivityTable rows={r.activity} hideRestaurant />
      </section>
      <section className="card p-4">
        <h3 className="mb-2 font-semibold">{t('admin.failedEmails')}</h3>
        {r.failedMessages.length ? <MessagesTable rows={r.failedMessages} hideRestaurant /> : <p className="text-muted">{t('admin.noFailed')}</p>}
      </section>

      {resetFor && <ResetPassword user={resetFor} onClose={() => setResetFor(null)} />}
      {adding && <AddUser restaurantId={r.id} onClose={() => setAdding(false)} onDone={refresh} />}
    </div>
  );
}

function ResetPassword({ user, onClose }: { user: { id: string; name: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/admin/users/${user.id}/password`, { password }),
    onSuccess: () => {
      toast.success(t('admin.passwordReset'));
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={`${t('admin.resetPassword')}: ${user.name}`} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label>
          <span className="label">{t('admin.newPassword')}</span>
          <input className="field" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </Modal>
  );
}

function AddUser({ restaurantId, onClose, onDone }: { restaurantId: string; onClose: () => void; onDone: (r: AdminRestaurantDetail) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'host' as Role });
  const save = useMutation({
    mutationFn: () => api.post<AdminRestaurantDetail>(`/admin/restaurants/${restaurantId}/users`, f),
    onSuccess: (r) => {
      onDone(r);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal open onClose={onClose} title={t('admin.addUser')} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input className="field" required placeholder={t('settings.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="field" required type="email" placeholder={t('settings.email')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input
          className="field"
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          placeholder={t('admin.newPassword')}
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        <select className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
          <option value="host">{t('settings.role.host')}</option>
          <option value="owner">{t('settings.role.owner')}</option>
        </select>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t('common.add')}
        </Button>
      </form>
    </Modal>
  );
}
