import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { desc, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { MessageDto, MessageTemplate } from '@hostly/shared';
import { env } from '../config/env';
import { InjectDb, type Db } from '../db/db.module';
import { messages, reservations, restaurants, type MessageRow } from '../db/schema';
import { CHANNEL_ADAPTERS, type ChannelAdapter } from './channel';
import { renderTemplate } from './templates';

const toDto = (m: MessageRow): MessageDto => ({
  id: m.id,
  reservationId: m.reservationId,
  channel: m.channel,
  templateKey: m.templateKey,
  language: m.language,
  status: m.status,
  recipient: m.recipient,
  error: m.error,
  sentAt: m.sentAt?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[],
  ) {}

  /**
   * Sends a guest message in the language stored on the reservation (never the
   * staff UI language). Records every attempt in `messages`.
   */
  async notifyReservation(reservationId: string, template: MessageTemplate): Promise<MessageDto | null> {
    try {
      const [row] = await this.db
        .select({ r: reservations, rest: restaurants })
        .from(reservations)
        .innerJoin(restaurants, eq(restaurants.id, reservations.restaurantId))
        .where(eq(reservations.id, reservationId));
      const email = row?.r.email;
      if (!email) return null;
      const { r, rest } = row;
      const adapter = this.adapters.find((a) => a.channel === 'email');
      if (!adapter) return null;

      const language = r.language;
      const at = DateTime.fromJSDate(r.arrivalAt).setZone(rest.timezone).setLocale(language === 'sr' ? 'sr-Latn' : 'en-GB');
      const base = env().APP_URL.replace(/\/$/, '');
      const manageUrl = `${base}/r/${r.guestToken}`;
      const content = renderTemplate(template, language, {
        guestName: [r.firstName, r.lastName].filter(Boolean).join(' ') || (language === 'sr' ? 'goste' : 'guest'),
        restaurantName: rest.name,
        date: at.toFormat('cccc, d. LLLL yyyy.'),
        time: at.toFormat('HH:mm'),
        covers: r.covers,
        manageUrl,
        confirmUrl: `${manageUrl}?action=confirm`,
        cancelUrl: `${manageUrl}?action=cancel`,
        reason: r.declineReason,
        restaurantPhone: rest.phone,
      });

      const [msg] = await this.db
        .insert(messages)
        .values({ restaurantId: r.restaurantId, reservationId: r.id, channel: 'email', templateKey: template, language, recipient: email })
        .returning();
      try {
        await adapter.send({ to: email, ...content });
        const [sent] = await this.db.update(messages).set({ status: 'sent', sentAt: new Date() }).where(eq(messages.id, msg.id)).returning();
        return toDto(sent);
      } catch (err) {
        const [failed] = await this.db
          .update(messages)
          .set({ status: 'failed', error: (err as Error).message.slice(0, 500) })
          .where(eq(messages.id, msg.id))
          .returning();
        this.logger.warn(`Email ${template} for ${r.id} failed: ${(err as Error).message}`);
        return toDto(failed);
      }
    } catch (err) {
      this.logger.error(`notifyReservation failed: ${(err as Error).message}`);
      return null;
    }
  }

  async listForReservation(reservationId: string): Promise<MessageDto[]> {
    const rows = await this.db.select().from(messages).where(eq(messages.reservationId, reservationId)).orderBy(desc(messages.createdAt));
    return rows.map(toDto);
  }

  /** Day-before reminders, checked every 30 minutes. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sendReminders() {
    if (!env().REMINDERS_ENABLED || env().NODE_ENV === 'test') return;
    const now = DateTime.now();
    const due = await this.db.query.reservations.findMany({
      columns: { id: true, arrivalAt: true, reminderSentAt: true, email: true, status: true },
      where: (r, { and, eq, gte, lt, isNull, isNotNull }) =>
        and(
          eq(r.status, 'confirmed'),
          gte(r.arrivalAt, now.plus({ hours: 20 }).toJSDate()),
          lt(r.arrivalAt, now.plus({ hours: 28 }).toJSDate()),
          isNull(r.reminderSentAt),
          isNotNull(r.email),
        ),
    });
    for (const r of due) {
      await this.db.update(reservations).set({ reminderSentAt: new Date() }).where(eq(reservations.id, r.id));
      await this.notifyReservation(r.id, 'reminder');
    }
  }
}
