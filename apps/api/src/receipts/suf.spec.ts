import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeVl, parseAmount, parseJournal, parseSufLink, parseVerificationPage, ReceiptLinkError, splitUnit } from './suf';

/** A real receipt QR (Novi Sad, 2.4.2026, 98.100,00 RSD); values checked against suf.purs.gov.rs. */
export const REAL_LINK = 'https://suf.purs.gov.rs/v/?vl=A1ZRTlhGQTNTVlFOWEZBM1MlAQAAIAEAAEDfeDoAAAAAAAABnU09OQgAAACcWCih0K8%2BEwo02qgmM0aHF8b4siLNEf7ATxaB%2BC2vuw2Nm%2FIlEHbqgRtAFbBfOD3uMzQdYX0P9AKoVYoyMjeaQjz32yHKchp2fxzTVHPJDAnyDKw9WsawiFoGfqFxsqwb37A1LtH5d2zLS1fTnRsAbdOB6wThvK%2BbGAlpcfI%2B9G9gMrg1lCFp80Et0WIDA6v4WrpXzpit6y3GifaBp6VEmBV9dE3YVW6VDOFx%2FQGiQneRl7H0kXkF3t1A7agRMatLtL%2FFDYOzqdGqq5FRzSNgn9wuhzMs2sro9ogmnWauM5U2gsKD%2FwWrpXTZjmKhJgLNKgfJW2M5egqxthmi4pcgkgiZ8r6oU4%2BzLCETExnv36%2Ffqp%2FqiM%2Fr4jp8neI8rHX0bdFYZBqk6ZN7M8ybMWyHOIOEAf12Fyek%2BSm%2B7ByFc4O2lUz%2FcTZZH2DVtz1arGFPgxXsJRU%2BwLNV5XCauaN7DhOjwvIezD4cevaJC6fctx8TCdfwxaavjR5sKsepI8w1np7fKntYAUVsz6ULQSDIi4HwDPWiw68TicWS0rK%2FUL63KaFPOF%2BWPZskqCOYcQmwDCs%2FHdy8ehtDfOKlf%2BJG24UMbPpHQiWPiODq%2FJmXWKaFVDh47SmTyhd1%2F6mDaFchhAGM%2Fo6GiG8%2B6wTcMfQ5s4p%2Fv9SYBaGbG0sAd9mgYm%2BjCat0dkrvdcgXtMP2VoQ%3D';

describe('Serbian fiscal receipt link', () => {
  it('decodes the header from the QR without network', () => {
    const h = decodeVl(parseSufLink(REAL_LINK).vl);
    expect(h).toMatchObject({
      invoiceNumber: 'VQNXFA3S-VQNXFA3S-293',
      requestedBy: 'VQNXFA3S',
      signedBy: 'VQNXFA3S',
      totalCounter: 293,
      transactionTypeCounter: 288,
      totalAmount: 98100,
      invoiceType: 'normal',
      transactionType: 'sale',
      buyerId: null,
    });
    // Shown on the verification page as "2.4.2026. 10:09:11" (Belgrade time).
    expect(h.issuedAt.toISOString()).toBe('2026-04-02T08:09:11.176Z');
  });

  it('finds the link inside scanned text and keeps "+" that the QR left unencoded', () => {
    const vl = parseSufLink(REAL_LINK).vl;
    expect(parseSufLink(`Račun: ${REAL_LINK} hvala`).vl).toBe(vl);
    const raw = REAL_LINK.replace(/%2B/g, '+').replace(/%2F/g, '/').replace(/%3D/g, '=');
    expect(parseSufLink(raw).vl).toBe(vl);
    expect(parseSufLink(REAL_LINK).url).toMatch(/^https:\/\/suf\.purs\.gov\.rs\/v\/\?vl=/);
  });

  it.each([
    'https://example.com/v/?vl=A1ZRTlhGQTNT',
    'https://suf.purs.gov.rs.evil.com/v/?vl=A1ZRTlhGQTNT',
    'https://suf.purs.gov.rs/v/',
    'not a link',
  ])('rejects %s', (text) => {
    expect(() => parseSufLink(text)).toThrow(ReceiptLinkError);
  });

  it('rejects damaged receipt data', () => {
    expect(() => decodeVl('A1ZRTlhGQTNT')).toThrow(ReceiptLinkError);
  });
});

describe('receipt text parsing', () => {
  it('reads Serbian amounts and units', () => {
    expect(parseAmount('98.100,00')).toBe(98100);
    expect(parseAmount('1,500')).toBe(1.5);
    expect(parseAmount('-360,00')).toBe(-360);
    expect(splitUnit('Usluge autoservisa (kom)')).toEqual({ name: 'Usluge autoservisa', unit: 'kom' });
    expect(splitUnit('Coca-Cola 0,25 l')).toEqual({ name: 'Coca-Cola 0,25 l', unit: null });
  });

  // Layout of the printed fiscal receipt (journal) defined by the e-fiscalization rules.
  const journal = [
    '============ ФИСКАЛНИ РАЧУН ============',
    'ПИБ:                           100000001',
    '-------------ПРОМЕТ ПРОДАЈА-------------',
    'Артикли',
    '========================================',
    'Назив   Цена         Кол.         Укупно',
    'Espresso (kom) (Ђ)',
    '              180,00          2   360,00',
    'Ćevapi 10 kom sa lukom i kajmakom',
    'porcija (kom) (Ђ)',
    '            1.150,00          1 1.150,00',
    'Vino belo (l) (Ђ)',
    '            2.400,00      0,750 1.800,00',
    '----------------------------------------',
    'Укупан износ:                   3.310,00',
    'Готовина:                       1.000,00',
    'Платна картица:                 2.310,00',
    '========================================',
  ].join('\n');

  it('reads items and payments from the receipt journal', () => {
    const { items, payments } = parseJournal(journal);
    expect(items).toEqual([
      { name: 'Espresso', unit: 'kom', unitPrice: 180, quantity: 2, total: 360, vatLabel: 'Ђ', vatRate: null, gtin: null },
      { name: 'Ćevapi 10 kom sa lukom i kajmakom porcija', unit: 'kom', unitPrice: 1150, quantity: 1, total: 1150, vatLabel: 'Ђ', vatRate: null, gtin: null },
      { name: 'Vino belo', unit: 'l', unitPrice: 2400, quantity: 0.75, total: 1800, vatLabel: 'Ђ', vatRate: null, gtin: null },
    ]);
    expect(payments).toEqual([
      { method: 'cash', amount: 1000 },
      { method: 'card', amount: 2310 },
    ]);
  });

  it('reads seller, token and journal from the verification page', () => {
    const html = `<span id="tinLabel">114202881</span><span id="shopFullNameLabel">1367517-CARAVAN CORP DOO NOVI SAD</span>
      <script>viewModel.InvoiceNumber('VQNXFA3S-VQNXFA3S-293'); viewModel.Token('3f1c');</script>
      <pre>Назив   Цена   Кол.   Укупно&#13;\nA &amp; B (kom) (Ђ)\n   10,00  1  10,00\n-----</pre>`;
    const p = parseVerificationPage(html);
    expect(p).toMatchObject({ sellerTin: '114202881', sellerName: '1367517-CARAVAN CORP DOO NOVI SAD', invoiceNumber: 'VQNXFA3S-VQNXFA3S-293', token: '3f1c' });
    expect(parseJournal(p.journal!).items[0]).toMatchObject({ name: 'A & B', total: 10 });
  });
});

describe('real verification page (suf.purs.gov.rs, fetched 21.10.2026)', () => {
  const html = readFileSync(join(__dirname, '__fixtures__', 'suf-verification-page.html'), 'utf8');

  it('reads seller, invoice number and token', () => {
    expect(parseVerificationPage(html)).toMatchObject({
      sellerTin: '114202881',
      sellerName: '1367517-CARAVAN CORP DOO NOVI SAD',
      sellerAddress: 'ТЕМЕРИНСКА 75',
      sellerCity: 'НОВИ САД',
      invoiceNumber: 'VQNXFA3S-VQNXFA3S-293',
      token: '00cec083-03d0-4242-9e59-1f5111d97d04',
    });
  });

  it('reads items and payment from the printed receipt (journal)', () => {
    const { items, payments } = parseJournal(parseVerificationPage(html).journal!);
    expect(items).toEqual([{ name: 'Usluge autoservisa', unit: 'kom', unitPrice: 98100, quantity: 1, total: 98100, vatLabel: 'А', vatRate: null, gtin: null }]);
    expect(payments).toEqual([{ method: 'cash', amount: 98100 }]);
  });
});
