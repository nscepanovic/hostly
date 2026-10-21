import { FALLBACK_LANGUAGE, type Language, type MessageTemplate } from '@hostly/shared';
import type { MessageLocale, TemplateVars } from './types';
import en from './en';
import sr from './sr';

export type { MessageLocale, TemplateVars } from './types';

/**
 * Guest message texts per language. A language without an entry here is sent in
 * English, so a new UI language can ship before its emails are translated.
 */
const LOCALES: Partial<Record<Language, MessageLocale>> = { sr, en };

export const messageLocale = (language: Language): MessageLocale => LOCALES[language] ?? LOCALES[FALLBACK_LANGUAGE]!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderTemplate(template: MessageTemplate, language: Language, vars: TemplateVars) {
  const locale = messageLocale(language);
  const r = locale.templates[template](vars);
  const urls = { confirm: vars.confirmUrl, cancel: vars.cancelUrl, manage: vars.manageUrl };
  const labels = locale.links;
  const text = [...r.lines, '', ...r.links.map((l) => `${labels[l]}: ${urls[l]}`), '', vars.restaurantName].join('\n');
  const buttons = r.links
    .map(
      (l) =>
        `<a href="${esc(urls[l])}" style="display:inline-block;margin:4px 8px 4px 0;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;${
          l === 'cancel' ? 'background:#f1f5f9;color:#0f172a' : 'background:#0d9488;color:#fff'
        }">${esc(labels[l])}</a>`,
    )
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0">
<h2 style="margin:0 0 16px;font-size:20px">${esc(vars.restaurantName)}</h2>
${r.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${esc(l)}</p>`).join('\n')}
<div style="margin-top:16px">${buttons}</div>
</div></div></body></html>`;
  return { subject: r.subject, text, html };
}
