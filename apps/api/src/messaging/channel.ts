import type { MessageChannel } from '@hostly/shared';

export interface OutgoingMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * A delivery channel. Email is the only MVP channel; SMS, Viber or WhatsApp
 * adapters implement this same interface and register in MessagingModule.
 */
export interface ChannelAdapter {
  readonly channel: MessageChannel;
  send(message: OutgoingMessage): Promise<void>;
}

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
