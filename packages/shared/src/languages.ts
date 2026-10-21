/**
 * Supported languages: the single place to register one.
 *
 * To add a language (e.g. German):
 *  1. add its code to LANGUAGES and an entry to LANGUAGE_INFO below;
 *  2. add apps/web/src/i18n/locales/<code>.ts and register it in locales/index.ts
 *     (it may be partial: missing texts fall back to English);
 *  3. add apps/api/src/messaging/templates/<code>.ts and register it in templates/index.ts.
 * Database columns store the code as text, so no migration is needed.
 */
export const LANGUAGES = ['sr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface LanguageInfo {
  /** Name in the language itself, as shown in pickers ("Deutsch", not "German"). */
  nativeName: string;
  /** BCP 47 locale for dates, numbers and sorting (Luxon / Intl). */
  locale: string;
  /** Luxon formats. */
  dateLong: string;
  dateShort: string;
  /** Browser language prefixes that should get this language (e.g. Croatian readers get Serbian). */
  matches: string[];
}

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  sr: { nativeName: 'Srpski', locale: 'sr-Latn', dateLong: 'cccc, d. LLLL yyyy.', dateShort: 'ccc dd.LL.yyyy', matches: ['sr', 'hr', 'bs', 'me', 'cnr', 'sh'] },
  en: { nativeName: 'English', locale: 'en-GB', dateLong: 'cccc, d LLLL yyyy', dateShort: 'ccc dd/LL/yyyy', matches: ['en'] },
};

/** Used when a translation or template is missing in the requested language. */
export const FALLBACK_LANGUAGE: Language = 'en';

export const isLanguage = (v: unknown): v is Language => typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);

/** Best supported language for a list of browser preferences (navigator.languages), or null. */
export function pickLanguage(preferences: readonly string[]): Language | null {
  for (const pref of preferences) {
    const tag = pref.toLowerCase();
    const exact = LANGUAGES.find((l) => l === tag || tag.startsWith(`${l}-`));
    if (exact) return exact;
    const prefix = tag.split('-')[0];
    const match = LANGUAGES.find((l) => LANGUAGE_INFO[l].matches.includes(prefix));
    if (match) return match;
  }
  return null;
}

export const languageLocale = (lang: string) => (isLanguage(lang) ? LANGUAGE_INFO[lang] : LANGUAGE_INFO[FALLBACK_LANGUAGE]).locale;
