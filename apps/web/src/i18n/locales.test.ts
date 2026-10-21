import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '@hostly/shared';
import { LOCALES, missingKeys } from './locales';

describe('locales', () => {
  it('has a locale for every language', () => {
    for (const l of LANGUAGES) expect(LOCALES[l]).toBeTruthy();
  });

  // Serbian is the default UI language, so it must be complete. Other languages
  // may ship partial (missing texts fall back to English); this lists the gaps.
  it('Serbian has every English text', () => {
    expect(missingKeys(LOCALES.sr)).toEqual([]);
  });

  it('detects missing keys', () => {
    expect(missingKeys({ common: { save: 'x' } }, { common: { save: 'Save', cancel: 'Cancel' }, nav: { floor: 'Floor' } })).toEqual([
      'common.cancel',
      'nav.floor',
    ]);
  });
});
