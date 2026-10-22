import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellRing, Info } from 'lucide-react';
import { PUSH_EVENTS, type PushEvent, type PushStatusDto } from '@hostly/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { deviceId } from '@/lib/device';
import { disablePush, enablePush, pushKey, pushSupport, updatePushEvents, usePushStatus } from '@/lib/push';

/** True when this device could get push notifications but hasn't turned them on yet. */
export function usePushNudge() {
  const { data } = usePushStatus();
  return pushSupport() === 'ok' && !!data?.publicKey && !data.subscription && Notification.permission !== 'denied';
}

/** Per-device push settings: on/off, which events, test. */
export function NotificationsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = usePushStatus();
  const [denied, setDenied] = useState(() => pushSupport() === 'ok' && Notification.permission === 'denied');
  const support = pushSupport();
  const set = (s: PushStatusDto | null) => s && qc.setQueryData(pushKey, s);
  const onError = (err: unknown) => toast.error(errorMessage(err));

  const enable = useMutation({
    mutationFn: () => enablePush(data!.publicKey!),
    onSuccess: (r) => {
      if (r === 'denied') setDenied(true);
      else if (r === 'failed') toast.error(t('push.subscribeFailed'));
      else set(r);
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: () => void qc.invalidateQueries({ queryKey: pushKey }),
    onError,
  });
  const events = useMutation({ mutationFn: updatePushEvents, onSuccess: set, onError });
  const test = useMutation({
    mutationFn: () => api.post<{ sent: number }>('/push/test', { deviceId: deviceId() }),
    onSuccess: (r) => (r.sent ? toast.success(t('push.testSent')) : toast.error(t('push.testFailed'))),
    onError,
  });

  const sub = data?.subscription;
  const toggle = (e: PushEvent, on: boolean) => {
    const current = sub?.events ?? [];
    events.mutate(on ? [...new Set([...current, e])] : current.filter((x) => x !== e));
  };
  const note = (text: string) => (
    <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
      <Info size={18} className="mt-0.5 shrink-0 text-muted" />
      {text}
    </p>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('push.title')} size="sm" nested>
      <div className="flex flex-col gap-4">
        <p className="text-muted">{t('push.intro')}</p>
        {support === 'ios-home-screen' ? (
          note(t('push.iosHint'))
        ) : support === 'unsupported' ? (
          note(t('push.unsupported'))
        ) : data && !data.publicKey ? (
          note(t('push.notConfigured'))
        ) : denied ? (
          note(t('push.denied'))
        ) : sub ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-accent">
              <BellRing size={18} />
              {t('push.enabled')}
            </p>
            <fieldset className="flex flex-col gap-1">
              {PUSH_EVENTS.map((e) => (
                <label key={e} className="flex h-11 items-center gap-3">
                  <input type="checkbox" className="h-5 w-5" checked={sub.events.includes(e)} disabled={events.isPending} onChange={(ev) => toggle(e, ev.target.checked)} />
                  {t(`push.events.${e}`)}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => test.mutate()} disabled={test.isPending}>
                {t('push.test')}
              </Button>
              <Button variant="ghost" onClick={() => disable.mutate()} disabled={disable.isPending}>
                {t('push.disable')}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="primary" icon={<BellRing size={18} />} onClick={() => enable.mutate()} disabled={!data || enable.isPending}>
            {t('push.enable')}
          </Button>
        )}
        <p className="text-xs text-muted">{t('push.perDevice')}</p>
      </div>
    </Modal>
  );
}
