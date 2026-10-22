import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import webpush from 'web-push';
import { LANGUAGE_INFO, type Language, type PushEvent, type PushStatusDto, type PushSubscriptionInput } from '@hostly/shared';
import type { AuthUser } from '../common/decorators';
import { env } from '../config/env';
import { InjectDb, type Db } from '../db/db.module';
import { pushSubscriptions, type PushSubscriptionRow } from '../db/schema';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { pushTexts, type PushText } from './messages';

/** Development/test-only key pair (like the dev encryption keys); production needs its own. */
const DEV_VAPID = {
  publicKey: 'BPRpnvfrfShvbb3Qr5d7nM0lJtiL0jw0Dr41qA7dmP0dqUmtuSa_ATrulM0stJlkLFUP-c3wZzNemQYTiwHoJW4',
  privateKey: 'Wx_EBLoXSTilmOzJC9GJV3dG2hZxGPbsvVtURIkwuB8',
};

/** Push services drop a notification that was not delivered in this time (e.g. tablet off all night). */
const TTL_SECONDS: Record<PushEvent | 'test', number> = { new_request: 6 * 3600, table_free: 15 * 60, guest_cancelled: 6 * 3600, test: 600 };

export interface PushPayload extends PushText {
  /** Opened when the notification is tapped. */
  url: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag: string;
}

type Sender = (sub: webpush.PushSubscription, payload: string, options: webpush.RequestOptions) => Promise<unknown>;

/**
 * Web Push to staff devices for events that matter when Hostly is not on
 * screen. Devices showing the app are skipped (they get the in-app pop-up).
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly log = new Logger(PushService.name);
  private vapid: { publicKey: string; privateKey: string } | null = null;
  /** Replaced in tests. */
  sender: Sender = (sub, payload, options) => webpush.sendNotification(sub, payload, options);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    const e = env();
    if (e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY) this.vapid = { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY };
    else if (e.NODE_ENV !== 'production') this.vapid = DEV_VAPID;
    else this.log.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set: push notifications are off');
  }

  async status(user: AuthUser, deviceId: string | undefined): Promise<PushStatusDto> {
    const [row] = deviceId
      ? await this.db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.deviceId, deviceId)))
      : [];
    return { publicKey: this.vapid?.publicKey ?? null, subscription: row ? { endpoint: row.endpoint, events: row.events } : null };
  }

  async subscribe(user: AuthUser, input: PushSubscriptionInput): Promise<PushStatusDto> {
    const values = {
      restaurantId: user.restaurantId,
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      deviceId: input.deviceId,
      language: input.language,
      events: input.events,
    };
    await this.db.transaction(async (tx) => {
      // A browser that re-subscribed gets a new endpoint: keep one subscription per device.
      await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.deviceId, input.deviceId), ne(pushSubscriptions.endpoint, input.endpoint)));
      // The same browser may now belong to another user (shared tablet): the endpoint moves with the login.
      await tx.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
    });
    return this.status(user, input.deviceId);
  }

  async unsubscribe(user: AuthUser, endpoint: string) {
    await this.db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  }

  /** Sends a test notification to this device (ignores whether the app is on screen). */
  async test(user: AuthUser, deviceId: string): Promise<{ sent: number }> {
    const rows = await this.db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.deviceId, deviceId)));
    let sent = 0;
    for (const row of rows) if (await this.send(row, { ...pushTexts(row.language).test, url: '/', tag: 'test' }, 'test')) sent++;
    return { sent };
  }

  // ---------- events ----------

  newRequest(restaurant: { id: string; timezone: string }, r: { id: string; firstName: string | null; lastName: string | null; covers: number; arrivalAt: string | Date }) {
    void this.notify(restaurant.id, 'new_request', (lang) =>
      pushTexts(lang).new_request({ name: fullName(r), covers: r.covers, when: when(r.arrivalAt, restaurant.timezone, lang) }),
    { url: `/?reservation=${r.id}&panel=priority`, tag: `request-${r.id}` });
  }

  tableFree(restaurantId: string, entry: { id: string; guestName: string; covers: number; createdAt: string }, labels: string[]) {
    const waitingMin = Math.max(0, Math.round((Date.now() - new Date(entry.createdAt).getTime()) / 60_000));
    void this.notify(restaurantId, 'table_free', (lang) => pushTexts(lang).table_free({ name: entry.guestName, covers: entry.covers, tables: labels.join('+'), waitingMin }), {
      url: '/?panel=waiting',
      tag: `waiting-${entry.id}`,
    });
  }

  guestCancelled(restaurant: { id: string; timezone: string }, r: { id: string; firstName: string | null; lastName: string | null; covers: number; arrivalAt: string | Date }) {
    void this.notify(restaurant.id, 'guest_cancelled', (lang) =>
      pushTexts(lang).guest_cancelled({ name: fullName(r), covers: r.covers, when: when(r.arrivalAt, restaurant.timezone, lang) }),
    { url: `/?reservation=${r.id}`, tag: `cancel-${r.id}` });
  }

  /** Sends to every subscribed device of the restaurant that wants `event` and doesn't have Hostly on screen. */
  async notify(restaurantId: string, event: PushEvent, text: (lang: Language) => PushText, target: { url: string; tag: string }): Promise<number> {
    if (!this.vapid) return 0;
    try {
      const subs = await this.db
        .select()
        .from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.restaurantId, restaurantId), sql`${event} = any(${pushSubscriptions.events})`));
      const onScreen = this.gateway.visibleDevices(restaurantId);
      const results = await Promise.all(subs.filter((s) => !onScreen.has(s.deviceId)).map((s) => this.send(s, { ...text(s.language), ...target }, event)));
      return results.filter(Boolean).length;
    } catch (err) {
      this.log.error(`Push ${event} failed: ${(err as Error).message}`);
      return 0;
    }
  }

  private async send(row: PushSubscriptionRow, payload: PushPayload, kind: PushEvent | 'test'): Promise<boolean> {
    if (!this.vapid) return false;
    try {
      await this.sender({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: env().VAPID_SUBJECT, ...this.vapid },
        TTL: TTL_SECONDS[kind],
        urgency: kind === 'table_free' || kind === 'new_request' ? 'high' : 'normal',
        timeout: 10_000,
      });
      await this.db.update(pushSubscriptions).set({ lastSentAt: new Date() }).where(eq(pushSubscriptions.id, row.id));
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // Gone: the user turned notifications off or the browser dropped the subscription.
      if (status === 404 || status === 410) await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, [row.id]));
      else this.log.warn(`Push to ${new URL(row.endpoint).host} failed: ${status ?? (err as Error).message}`);
      return false;
    }
  }
}

const fullName = (r: { firstName: string | null; lastName: string | null }) => [r.lastName, r.firstName].filter(Boolean).join(' ') || '—';

/** "pet 24. 10. 20:00" / "Fri 24/10, 20:00" in the restaurant's timezone. */
const when = (at: string | Date, tz: string, lang: Language) =>
  (typeof at === 'string' ? DateTime.fromISO(at) : DateTime.fromJSDate(at))
    .setZone(tz)
    .setLocale(LANGUAGE_INFO[lang].locale)
    .toLocaleString({ weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
