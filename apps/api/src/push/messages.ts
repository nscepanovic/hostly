import { FALLBACK_LANGUAGE, type Language, type PushEvent } from '@hostly/shared';

export interface PushText {
  title: string;
  body: string;
}

interface Vars {
  name: string;
  covers: number;
  /** Already formatted in the restaurant's timezone and the device language. */
  when?: string;
  tables?: string;
  waitingMin?: number;
}

type Texts = Record<PushEvent, (v: Vars) => PushText> & { test: PushText };

/** Staff notification texts. A language without an entry gets English. */
const TEXTS: Partial<Record<Language, Texts>> = {
  sr: {
    new_request: (v) => ({ title: 'Novi zahtev za rezervaciju', body: `${v.name} · ${v.covers} os. · ${v.when}` }),
    table_free: (v) => ({ title: `Sto ${v.tables} je slobodan`, body: `${v.name} (${v.covers}) čeka ${v.waitingMin} min` }),
    guest_cancelled: (v) => ({ title: 'Gost je otkazao rezervaciju', body: `${v.name} · ${v.covers} os. · ${v.when}` }),
    test: { title: 'Hostly obaveštenja rade', body: 'Ovde će stizati novi zahtevi i slobodni stolovi.' },
  },
  en: {
    new_request: (v) => ({ title: 'New reservation request', body: `${v.name} · ${v.covers} guests · ${v.when}` }),
    table_free: (v) => ({ title: `Table ${v.tables} is free`, body: `${v.name} (${v.covers}) has been waiting ${v.waitingMin} min` }),
    guest_cancelled: (v) => ({ title: 'A guest cancelled', body: `${v.name} · ${v.covers} guests · ${v.when}` }),
    test: { title: 'Hostly notifications work', body: 'New requests and free tables will show up here.' },
  },
};

export const pushTexts = (language: Language): Texts => TEXTS[language] ?? TEXTS[FALLBACK_LANGUAGE]!;
