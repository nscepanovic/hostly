import { describe, expect, it } from 'vitest';
import { LANGUAGE_INFO, LANGUAGES, pickLanguage } from './languages';

describe('languages', () => {
  it('has info for every language', () => {
    for (const l of LANGUAGES) expect(LANGUAGE_INFO[l].nativeName).toBeTruthy();
  });

  it('picks the best supported language from browser preferences', () => {
    expect(pickLanguage(['sr-Latn-RS', 'en'])).toBe('sr');
    expect(pickLanguage(['hr-HR'])).toBe('sr');
    expect(pickLanguage(['de-DE', 'en-US'])).toBe('en');
    expect(pickLanguage(['de-DE', 'fr'])).toBeNull();
  });
});
