import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DateTime } from 'luxon';
import { Bell, BellRing, Armchair, LogOut, Plus } from 'lucide-react';
import { formatPhone, type WaitingEntryDto } from '@hostly/shared';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { qk } from '@/lib/queries';
import { SuggestionSheet } from '../reservation/SuggestionSheet';

export function useWaitingActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: 'seated' | 'left'; notified?: boolean; tableIds?: string[] }) =>
      api.patch<WaitingEntryDto>(`/waiting/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.waiting });
      void qc.invalidateQueries({ queryKey: qk.reservationsAll });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function WaitingList({ entries }: { entries: WaitingEntryDto[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const update = useWaitingActions();
  const [form, setForm] = useState({ guestName: '', phone: '', covers: 2 });
  const [adding, setAdding] = useState(false);
  const [seating, setSeating] = useState<WaitingEntryDto | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<WaitingEntryDto>('/waiting', { ...form, phone: form.phone || null }),
    onSuccess: () => {
      setForm({ guestName: '', phone: '', covers: 2 });
      setAdding(false);
      void qc.invalidateQueries({ queryKey: qk.waiting });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className="flex flex-col gap-2">
      {adding ? (
        <form onSubmit={submit} className="card grid grid-cols-[1fr_5rem] gap-2 p-3">
          <input
            className="field col-span-2"
            placeholder={t('waiting.guestName')}
            required
            autoFocus
            value={form.guestName}
            onChange={(e) => setForm({ ...form, guestName: e.target.value })}
          />
          <input className="field" type="tel" placeholder={t('waiting.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input
            className="field text-center"
            type="number"
            min={1}
            inputMode="numeric"
            aria-label={t('waiting.covers')}
            value={form.covers}
            onChange={(e) => setForm({ ...form, covers: Number(e.target.value) })}
          />
          <Button onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t('common.add')}
          </Button>
        </form>
      ) : (
        <Button icon={<Plus size={18} />} onClick={() => setAdding(true)}>
          {t('waiting.add')}
        </Button>
      )}
      {!entries.length && <p className="p-6 text-center text-muted">{t('waiting.empty')}</p>}
      {entries.map((w) => {
        const mins = Math.max(0, Math.round(-DateTime.fromISO(w.createdAt).diffNow('minutes').minutes));
        return (
          <div key={w.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-2">
            <div className="min-w-0 flex-1 pl-1">
              <div className="truncate font-semibold">{w.guestName}</div>
              <div className="text-sm text-muted">
                {t('waiting.waitingFor', { min: mins })}
                {w.phone && ` · ${formatPhone(w.phone)}`}
                {w.notes && ` · ${w.notes}`}
              </div>
            </div>
            <span className="w-8 text-center text-lg font-bold">{w.covers}</span>
            <button
              type="button"
              onClick={() => update.mutate({ id: w.id, notified: !w.notifiedAt })}
              className={`flex h-11 w-11 items-center justify-center rounded-lg ${w.notifiedAt ? 'bg-accent/20 text-accent' : 'bg-surface-3'}`}
              aria-label={w.notifiedAt ? t('waiting.notified') : t('waiting.notify')}
              title={w.notifiedAt ? t('waiting.notified') : t('waiting.notify')}
            >
              {w.notifiedAt ? <BellRing size={20} /> : <Bell size={20} />}
            </button>
            <button
              type="button"
              onClick={() => setSeating(w)}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-ok text-white"
              aria-label={t('waiting.seat')}
              title={t('waiting.seat')}
            >
              <Armchair size={20} />
            </button>
            <button
              type="button"
              onClick={() => update.mutate({ id: w.id, status: 'left' })}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-3 text-muted"
              aria-label={t('waiting.left')}
              title={t('waiting.left')}
            >
              <LogOut size={20} />
            </button>
          </div>
        );
      })}
      {seating && (
        <SuggestionSheet
          open
          title={`${t('waiting.seat')}: ${seating.guestName} (${seating.covers})`}
          covers={seating.covers}
          arrivalAt={DateTime.now().toISO()!}
          onClose={() => setSeating(null)}
          onPick={(tableIds) => {
            update.mutate({ id: seating.id, status: 'seated', tableIds });
            setSeating(null);
          }}
        />
      )}
    </div>
  );
}
