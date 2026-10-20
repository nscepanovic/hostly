import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import sr from './locales/sr';

const LANG_KEY = 'hostly-lang';

function storedLanguage(): string {
  try {
    return localStorage.getItem(LANG_KEY) ?? 'sr';
  } catch {
    return 'sr';
  }
}

void i18n.use(initReactI18next).init({
  resources: { sr: { translation: sr }, en: { translation: en } },
  lng: storedLanguage(),
  fallbackLng: 'sr',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'sr' | 'en') {
  void i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Private mode: language just won't persist.
  }
}

/** Luxon locale for the UI language (Serbian Latin). */
export const luxonLocale = (lang: string) => (lang === 'sr' ? 'sr-Latn' : 'en-GB');

export default i18n;
