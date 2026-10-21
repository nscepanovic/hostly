import type { MessageLocale } from './types';

/** Serbian (Latin) guest messages. */
const sr: MessageLocale = {
  guestFallback: 'goste',
  links: { confirm: 'Potvrđujem dolazak', cancel: 'Otkaži rezervaciju', manage: 'Pogledaj rezervaciju' },
  templates: {
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
};

export default sr;
