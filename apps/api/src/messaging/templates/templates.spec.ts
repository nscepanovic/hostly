import { LANGUAGES, type Language } from '@hostly/shared';
import { messageLocale, renderTemplate, type TemplateVars } from '.';

const vars: TemplateVars = {
  guestName: 'Ana <b>',
  restaurantName: 'Kafana',
  date: 'petak, 23. oktobar 2026.',
  time: '20:00',
  covers: 4,
  manageUrl: 'https://x/r/t',
  confirmUrl: 'https://x/r/t?action=confirm',
  cancelUrl: 'https://x/r/t?action=cancel',
};

describe('message templates', () => {
  it('renders every template in every language', () => {
    for (const lang of LANGUAGES) {
      for (const tpl of ['request_received', 'confirmed', 'declined', 'reminder', 'cancelled'] as const) {
        const m = renderTemplate(tpl, lang, vars);
        expect(m.subject).toContain('Kafana');
        expect(m.text).toContain('Ana <b>');
        expect(m.html).toContain('Ana &lt;b&gt;');
      }
    }
  });

  it('falls back to English for a language without its own texts', () => {
    expect(messageLocale('xx' as Language)).toBe(messageLocale('en'));
    expect(messageLocale('sr').guestFallback).toBe('goste');
  });
});
