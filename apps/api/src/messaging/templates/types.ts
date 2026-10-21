import type { MessageTemplate } from '@hostly/shared';

export interface TemplateVars {
  guestName: string;
  restaurantName: string;
  date: string;
  time: string;
  covers: number;
  manageUrl: string;
  confirmUrl: string;
  cancelUrl: string;
  reason?: string | null;
  restaurantPhone?: string | null;
}

export type LinkKind = 'confirm' | 'cancel' | 'manage';

export interface Rendered {
  subject: string;
  lines: string[];
  links: LinkKind[];
}

/** Everything a guest message needs in one language. */
export interface MessageLocale {
  /** Used in the greeting when the guest left no name. */
  guestFallback: string;
  links: Record<LinkKind, string>;
  templates: Record<MessageTemplate, (v: TemplateVars) => Rendered>;
}
