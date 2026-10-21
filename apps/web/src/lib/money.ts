import { langInfo } from './time';

/** Receipts are Serbian fiscal receipts, so amounts are dinars. */
export const CURRENCY = 'RSD';

const formats = new Map<string, Intl.NumberFormat>();

/** "98.100,00 RSD" (or "98.100 RSD" with decimals: 0). */
export function fmtMoney(amount: number, lang: string, decimals = 2) {
  const key = `${lang}:${decimals}`;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(langInfo(lang).locale, { style: 'currency', currency: CURRENCY, currencyDisplay: 'code', minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    formats.set(key, f);
  }
  return f.format(amount);
}

/** Amount without the currency, for places that show RSD separately ("1.890.710"). */
export const fmtAmount = (amount: number, lang: string, decimals = 0) =>
  new Intl.NumberFormat(langInfo(lang).locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);

export const fmtQty = (q: number, lang: string) => new Intl.NumberFormat(langInfo(lang).locale, { maximumFractionDigits: 3 }).format(q);
