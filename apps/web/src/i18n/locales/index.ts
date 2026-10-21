import type { Language } from '@hostly/shared';
import en, { type Translation } from './en';
import sr from './sr';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };
/** A new language may start partial: missing texts fall back to English. */
export type PartialTranslation = DeepPartial<Translation>;

/** UI texts per language. TypeScript requires an entry for every language in LANGUAGES. */
export const LOCALES: Record<Language, PartialTranslation> = { sr, en };

/** Keys present in English but missing in `locale` (for translators; see locales.test.ts). */
export function missingKeys(locale: PartialTranslation, base: object = en, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(base)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const other = (locale as Record<string, unknown>)[k];
    if (typeof v === 'string') {
      if (typeof other !== 'string' || !other) out.push(path);
    } else out.push(...missingKeys((other ?? {}) as PartialTranslation, v as object, path));
  }
  return out;
}
