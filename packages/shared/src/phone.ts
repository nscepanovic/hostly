import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalizes a phone number to E.164. Local numbers are read in `defaultCountry`
 * (Serbia by default, so "064 996 4772" becomes "+381649964772").
 * Returns null when the input cannot be parsed as a plausible number.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry: CountryCode = 'RS'): string | null {
  if (!input) return null;
  const cleaned = input.trim().replace(/^00/, '+');
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isPossible()) return null;
  return parsed.number;
}

/** Digits only, for prefix search while typing. */
export function phoneDigits(input: string): string {
  return input.replace(/\D/g, '');
}

/** ISO country code for a stored E.164 number, used to show a flag. */
export function phoneCountry(e164: string | null | undefined): string | null {
  if (!e164) return null;
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === 'RS' ? parsed.formatNational() : parsed.formatInternational();
}

/** Digit-only forms of an E.164 number: international (381649964772) and national (0649964772). */
export function phoneDigitForms(e164: string): { intl: string; national: string } {
  const parsed = parsePhoneNumberFromString(e164);
  const intl = e164.replace(/\D/g, '');
  return { intl, national: parsed ? parsed.formatNational().replace(/\D/g, '') : intl };
}
