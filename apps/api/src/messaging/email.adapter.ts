import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import type { ChannelAdapter, OutgoingMessage } from './channel';

/** SMTP email (works with Resend's SMTP relay). Without SMTP_HOST, messages are logged instead. */
@Injectable()
export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  private readonly logger = new Logger('Email');
  private readonly transport: Transporter;
  /** Last messages, kept for tests and local debugging when no SMTP is configured. */
  readonly outbox: OutgoingMessage[] = [];

  constructor() {
    const e = env();
    this.transport = e.SMTP_HOST
      ? nodemailer.createTransport({
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          secure: e.SMTP_SECURE,
          auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true });
  }

  async send(message: OutgoingMessage) {
    await this.transport.sendMail({ from: env().MAIL_FROM, ...message });
    if (!env().SMTP_HOST) {
      this.outbox.push(message);
      if (this.outbox.length > 50) this.outbox.shift();
      if (env().NODE_ENV !== 'test') this.logger.log(`[dev email] to=${message.to} subject="${message.subject}"\n${message.text}`);
    }
  }
}
