import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PUSH_EVENTS, isLanguage, type PushEvent, type PushStatusDto } from '@hostly/shared';
import i18n from '@/i18n';
import { api } from './api';
import { deviceId } from './device';

export type PushSupport = 'ok' | 'ios-home-screen' | 'unsupported';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** iPad/iPhone only allow push for apps added to the Home Screen (iPadOS/iOS 16.4+). */
export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  return isIos() && !isStandalone() ? 'ios-home-screen' : 'unsupported';
}

export const pushKey = ['push', 'status'] as const;

export function usePushStatus() {
  return useQuery({
    queryKey: pushKey,
    queryFn: () => api.get<PushStatusDto>('/push', { deviceId: deviceId() }),
    staleTime: 60_000,
  });
}

function base64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const language = () => (isLanguage(i18n.language) ? i18n.language : 'sr');

async function save(sub: PushSubscription, events: PushEvent[]) {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return api.put<PushStatusDto>('/push/subscription', { endpoint: json.endpoint, keys: json.keys, deviceId: deviceId(), language: language(), events });
}

/** Asks permission (must run from a tap) and subscribes this device. */
export async function enablePush(publicKey: string, events: PushEvent[] = [...PUSH_EVENTS]): Promise<PushStatusDto | 'denied' | 'failed'> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
  } catch (err) {
    // The browser's push service refused or is unreachable (private mode, blocked network, old browser).
    return (err as DOMException).name === 'NotAllowedError' ? 'denied' : 'failed';
  }
  return save(sub, events);
}

export async function updatePushEvents(events: PushEvent[]) {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  return sub ? save(sub, events) : null;
}

export async function disablePush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  await api.delete(`/push/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`);
  await sub.unsubscribe();
}

/**
 * Keeps the server's copy current: after logging in on a shared tablet (the
 * subscription moves to the new user) or switching the UI language.
 */
export function usePushSync(userId: string, uiLanguage: string) {
  const qc = useQueryClient();
  const { data } = usePushStatus();
  const loaded = !!data;
  useEffect(() => {
    if (!loaded || pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
    let cancelled = false;
    void (async () => {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (!sub || cancelled) return;
      const events = qc.getQueryData<PushStatusDto>(pushKey)?.subscription?.events ?? [...PUSH_EVENTS];
      const status = await save(sub, events);
      if (!cancelled) qc.setQueryData(pushKey, status);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, uiLanguage, loaded, qc]);
}
