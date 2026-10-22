/// <reference lib="webworker" />
// Service worker: offline app shell (precache) + staff push notifications.
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

// New versions take over right away (the page reloads via registerType: 'autoUpdate').
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/socket\.io\//] }));

interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload;
  try {
    data = event.data!.json() as PushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      data: { url: data.url },
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      // Same tag replaces the old notification; still alert the user again.
      renotify: true,
    } as NotificationOptions & { renotify: boolean }),
  );
});

// Tapping a notification opens Hostly (or brings it to the front) at the right screen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'hostly:navigate', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
