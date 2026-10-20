import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneCountry } from './phone';
import { durationForCovers } from './time';

describe('normalizePhone', () => {
  it('reads local Serbian numbers', () => {
    expect(normalizePhone('064 996 4772')).toBe('+381649964772');
    expect(normalizePhone('021 420 215')).toBe('+38121420215');
  });
  it('keeps international numbers', () => {
    expect(normalizePhone('+382 67 443 907')).toBe('+38267443907');
    expect(normalizePhone('00382 67 443 907')).toBe('+38267443907');
    expect(phoneCountry('+38267443907')).toBe('ME');
  });
  it('rejects garbage', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('durationForCovers', () => {
  const rules = [
    { upToCovers: 4, minutes: 120 },
    { upToCovers: 2, minutes: 90 },
  ];
  it('picks the first matching rule', () => {
    expect(durationForCovers(rules, 2, 100)).toBe(90);
    expect(durationForCovers(rules, 3, 100)).toBe(120);
    expect(durationForCovers(rules, 9, 100)).toBe(100);
  });
});
