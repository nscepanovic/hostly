import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { FALLBACK_LANGUAGE, isLanguage, LANGUAGES, languageLocale, type Language } from '@hostly/shared';
import { LOCALES } from './locales';

const LANG_KEY = 'hostly-lang';
/** Staff UI default when nothing was chosen on this device. */
const DEFAULT_UI_LANGUAGE: Language = 'sr';

function storedLanguage(): Language {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return isLanguage(v) ? v : DEFAULT_UI_LANGUAGE;
  } catch {
    return DEFAULT_UI_LANGUAGE;
  }
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map((l) => [l, { translation: LOCALES[l] }])),
  lng: storedLanguage(),
  // Partially translated languages show English for the missing texts.
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false },
});
if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

/** `persist: false` for guest-facing pages so a staff device keeps its own language. */
export function setLanguage(lang: Language, persist = true) {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  if (!persist) return;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Private mode: language just won't persist.
  }
}

/** Luxon / Intl locale for a UI language. */
export const luxonLocale = (lang: string) => languageLocale(lang);

export default i18n;
