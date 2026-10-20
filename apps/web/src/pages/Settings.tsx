import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { LANGUAGES, type OpeningHours, type RestaurantDto, type RestaurantSettingsInput, type Shift, type UserDto } from '@hostly/shared';
import { Button, IconButton } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/Confirm';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { qk, useMe, useRestaurant } from '@/lib/queries';

const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

function toInput(r: RestaurantDto): RestaurantSettingsInput {
  return {
    name: r.name,
    timezone: r.timezone,
    defaultLanguage: r.defaultLanguage,
    openingHours: r.openingHours,
    dayStart: r.dayStart,
    defaultDurationMin: r.defaultDurationMin,
    slotMinutes: r.slotMinutes,
    maxPartySize: r.maxPartySize,
    pacingMaxReservationsPerSlot: r.pacingMaxReservationsPerSlot,
    pacingMaxCoversPerSlot: r.pacingMaxCoversPerSlot,
    email: r.email,
    phone: r.phone,
    address: r.address,
  };
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: restaurant } = useRestaurant();
  const [s, setS] = useState<RestaurantSettingsInput | null>(null);
  useEffect(() => {
    if (restaurant && !s) setS(toInput(restaurant));
  }, [restaurant, s]);
  const save = useMutation({
    mutationFn: () => api.put<RestaurantDto>('/restaurant', s),
    onSuccess: (r) => {
      qc.setQueryData(qk.restaurant, r);
      toast.success(t('common.saved'));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (!s) return null;
  const set = <K extends keyof RestaurantSettingsInput>(k: K, v: RestaurantSettingsInput[K]) => setS({ ...s, [k]: v });
  const setDay = (day: (typeof DAYS)[number], shifts: Shift[]) => set('openingHours', { ...s.openingHours, [day]: shifts } as OpeningHours);
  const num = (k: 'defaultDurationMin' | 'slotMinutes' | 'maxPartySize', label: string) => (
    <label>
      <span className="label">{label}</span>
      <input className="field" type="number" min={1} value={s[k]} onChange={(e) => set(k, Number(e.target.value))} />
    </label>
  );
  const nullableNum = (k: 'pacingMaxReservationsPerSlot' | 'pacingMaxCoversPerSlot', label: string) => (
    <label>
      <span className="label">{label}</span>
      <input
        className="field"
        type="number"
        min={0}
        placeholder="∞"
        value={s[k] ?? ''}
        onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-3 pb-24">
        <section className="card p-4">
          <h3 className="mb-3 font-semibold">{t('settings.general')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 sm:col-span-1">
              <span className="label">{t('settings.name')}</span>
              <input className="field" value={s.name} onChange={(e) => set('name', e.target.value)} />
            </label>
            <label>
              <span className="label">{t('settings.timezone')}</span>
              <input className="field" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </label>
            <label>
              <span className="label">{t('settings.defaultLanguage')}</span>
              <select className="field" value={s.defaultLanguage} onChange={(e) => set('defaultLanguage', e.target.value as RestaurantSettingsInput['defaultLanguage'])}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {t(`language.${l}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{t('settings.dayStart')}</span>
              <input className="field" type="time" value={s.dayStart} onChange={(e) => set('dayStart', e.target.value)} />
            </label>
            {num('defaultDurationMin', t('settings.defaultDuration'))}
            {num('slotMinutes', t('settings.slotMinutes'))}
            {num('maxPartySize', t('settings.maxPartySize'))}
            {nullableNum('pacingMaxReservationsPerSlot', t('settings.pacingReservations'))}
            {nullableNum('pacingMaxCoversPerSlot', t('settings.pacingCovers'))}
            <label>
              <span className="label">{t('settings.phone')}</span>
              <input className="field" value={s.phone ?? ''} onChange={(e) => set('phone', e.target.value || null)} />
            </label>
            <label>
              <span className="label">{t('settings.email')}</span>
              <input className="field" type="email" value={s.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
            </label>
            <label>
              <span className="label">{t('settings.address')}</span>
              <input className="field" value={s.address ?? ''} onChange={(e) => set('address', e.target.value || null)} />
            </label>
          </div>
        </section>

        <section className="card p-4">
          <h3 className="mb-3 font-semibold">{t('settings.openingHours')}</h3>
          <div className="flex flex-col gap-3">
            {DAYS.map((day) => {
              const shifts = s.openingHours[day] ?? [];
              return (
                <div key={day} className="flex flex-wrap items-start gap-2 border-b border-border/60 pb-3 last:border-0">
                  <span className="w-12 pt-2.5 font-semibold">{t(`settings.weekday.${day}`)}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {!shifts.length && <span className="pt-2.5 text-muted">{t('settings.closed')}</span>}
                    {shifts.map((sh, i) => {
                      const patch = (p: Partial<Shift>) => setDay(day, shifts.map((x, j) => (j === i ? { ...x, ...p } : x)));
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <select className="field h-10 w-28" value={sh.name} onChange={(e) => patch({ name: e.target.value })}>
                            {['breakfast', 'lunch', 'dinner'].map((n) => (
                              <option key={n} value={n}>
                                {t(`shift.${n}`)}
                              </option>
                            ))}
                          </select>
                          <input className="field h-10 w-28" type="time" value={sh.open} onChange={(e) => patch({ open: e.target.value })} />
                          <span>–</span>
                          <input className="field h-10 w-28" type="time" value={sh.close} onChange={(e) => patch({ close: e.target.value })} />
                          <IconButton label={t('common.delete')} onClick={() => setDay(day, shifts.filter((_, j) => j !== i))}>
                            <Trash2 size={18} />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                  <IconButton
                    label={t('settings.addShift')}
                    className="border border-border"
                    onClick={() => setDay(day, [...shifts, { name: shifts.length ? 'dinner' : 'lunch', open: shifts.at(-1)?.close ?? '12:00', close: '23:00' }])}
                  >
                    <Plus size={18} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        </section>

        <Users />
      </div>
      <div className="safe-bottom fixed right-4 bottom-20 z-10 md:bottom-4">
        <Button variant="primary" size="lg" className="shadow-xl" onClick={() => save.mutate()} disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function Users() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: users = [] } = useQuery({ queryKey: qk.users, queryFn: () => api.get<UserDto[]>('/users') });
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'host' as UserDto['role'] });
  const create = useMutation({
    mutationFn: () => api.post<UserDto>('/users', form),
    onSuccess: () => {
      setForm({ name: '', email: '', password: '', role: 'host' });
      void qc.invalidateQueries({ queryKey: qk.users });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-semibold">{t('settings.users')}</h3>
      <div className="mb-4 flex flex-col gap-1">
        {users.map((u) => (
          <div key={u.id} className="flex h-12 items-center gap-3 rounded-lg bg-surface-2 px-3">
            <span className="flex-1 truncate font-medium">{u.name}</span>
            <span className="hidden truncate text-sm text-muted sm:inline">{u.email}</span>
            <span className="rounded bg-surface-3 px-2 text-sm">{t(`settings.role.${u.role}`)}</span>
            {u.id !== me?.id && (
              <IconButton
                label={t('common.delete')}
                onClick={async () => (await confirmDialog(`${t('common.delete')}: ${u.name}?`, { danger: true })).ok && remove.mutate(u.id)}
              >
                <Trash2 size={18} />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className="field" required placeholder={t('settings.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field" required type="email" placeholder={t('settings.email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input
          className="field"
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          placeholder={t('settings.password')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserDto['role'] })}>
          <option value="host">{t('settings.role.host')}</option>
          <option value="owner">{t('settings.role.owner')}</option>
        </select>
        <Button type="submit" variant="primary" icon={<Plus size={18} />} disabled={create.isPending}>
          {t('settings.addUser')}
        </Button>
      </form>
    </section>
  );
}
