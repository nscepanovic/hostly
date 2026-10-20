import type { Language, MessageTemplate } from '@hostly/shared';

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

type Rendered = { subject: string; lines: string[]; links: Array<'confirm' | 'cancel' | 'manage'> };

const T: Record<Language, Record<MessageTemplate, (v: TemplateVars) => Rendered>> = {
  sr: {
    request_received: (v) => ({
      subject: `Primili smo vaš zahtev — ${v.restaurantName}`,
      lines: [
        `Poštovani/a ${v.guestName},`,
        `primili smo vaš zahtev za rezervaciju: ${v.date} u ${v.time}, broj gostiju: ${v.covers}.`,
        'Javićemo vam čim restoran potvrdi rezervaciju.',
      ],
      links: ['cancel'],
    }),
    confirmed: (v) => ({
      subject: `Rezervacija potvrđena — ${v.restaurantName}`,
      lines: [`Poštovani/a ${v.guestName},`, `vaša rezervacija je potvrđena: ${v.date} u ${v.time}, broj gostiju: ${v.covers}.`, 'Radujemo se vašem dolasku!'],
      links: ['confirm', 'cancel'],
    }),
    declined: (v) => ({
      subject: `Rezervacija nije moguća — ${v.restaurantName}`,
      lines: [
        `Poštovani/a ${v.guestName},`,
        `nažalost ne možemo da prihvatimo vaš zahtev za ${v.date} u ${v.time}.`,
        ...(v.reason ? [`Razlog: ${v.reason}`] : []),
        v.restaurantPhone ? `Za drugi termin pozovite nas na ${v.restaurantPhone}.` : 'Pokušajte sa drugim terminom.',
      ],
      links: [],
    }),
    reminder: (v) => ({
      subject: `Podsetnik: sutra ${v.time} — ${v.restaurantName}`,
      lines: [`Poštovani/a ${v.guestName},`, `podsećamo vas na rezervaciju sutra, ${v.date} u ${v.time}, broj gostiju: ${v.covers}.`, 'Ako ne možete da dođete, molimo otkažite rezervaciju.'],
      links: ['confirm', 'cancel'],
    }),
    cancelled: (v) => ({
      subject: `Rezervacija otkazana — ${v.restaurantName}`,
      lines: [`Poštovani/a ${v.guestName},`, `vaša rezervacija za ${v.date} u ${v.time} je otkazana.`],
      links: [],
    }),
  },
  en: {
    request_received: (v) => ({
      subject: `We received your request — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `we received your reservation request: ${v.date} at ${v.time}, ${v.covers} guests.`, 'We will let you know as soon as the restaurant confirms it.'],
      links: ['cancel'],
    }),
    confirmed: (v) => ({
      subject: `Reservation confirmed — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `your reservation is confirmed: ${v.date} at ${v.time}, ${v.covers} guests.`, 'We look forward to seeing you!'],
      links: ['confirm', 'cancel'],
    }),
    declined: (v) => ({
      subject: `Reservation not possible — ${v.restaurantName}`,
      lines: [
        `Dear ${v.guestName},`,
        `unfortunately we cannot accept your request for ${v.date} at ${v.time}.`,
        ...(v.reason ? [`Reason: ${v.reason}`] : []),
        v.restaurantPhone ? `Call us at ${v.restaurantPhone} to find another time.` : 'Please try another time.',
      ],
      links: [],
    }),
    reminder: (v) => ({
      subject: `Reminder: tomorrow at ${v.time} — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `a reminder of your reservation tomorrow, ${v.date} at ${v.time}, ${v.covers} guests.`, 'If you cannot make it, please cancel.'],
      links: ['confirm', 'cancel'],
    }),
    cancelled: (v) => ({
      subject: `Reservation cancelled — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `your reservation for ${v.date} at ${v.time} has been cancelled.`],
      links: [],
    }),
  },
};

const LINK_LABELS: Record<Language, Record<'confirm' | 'cancel' | 'manage', string>> = {
  sr: { confirm: 'Potvrđujem dolazak', cancel: 'Otkaži rezervaciju', manage: 'Pogledaj rezervaciju' },
  en: { confirm: 'Confirm attendance', cancel: 'Cancel reservation', manage: 'View reservation' },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderTemplate(template: MessageTemplate, language: Language, vars: TemplateVars) {
  const r = T[language][template](vars);
  const urls = { confirm: vars.confirmUrl, cancel: vars.cancelUrl, manage: vars.manageUrl };
  const labels = LINK_LABELS[language];
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
