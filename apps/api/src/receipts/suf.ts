/**
 * Serbian fiscal receipts (SUF / PURS, https://suf.purs.gov.rs).
 *
 * Every Serbian fiscal receipt carries a QR code with a verification URL whose
 * `vl` parameter is the signed receipt header. Two levels of data:
 * 1. decodeVl(): parsed locally from the QR, no network: invoice number,
 *    total, time, sale/refund. Always available.
 * 2. scrapeSuf(): the public verification page and its "specifications"
 *    endpoint: seller, line items, payment methods (from the receipt journal).
 * Deterministic parsing only; nothing is guessed.
 */
import type { PaymentMethod } from '@hostly/shared';

export const SUF_HOST = 'suf.purs.gov.rs';
export const SUF_ORIGIN = `https://${SUF_HOST}`;

export class ReceiptLinkError extends Error {}

const INVOICE_TYPES = ['normal', 'proforma', 'copy', 'training', 'advance'] as const;
export type SufInvoiceType = (typeof INVOICE_TYPES)[number];
export type SufTransactionType = 'sale' | 'refund';

export interface SufHeader {
  invoiceNumber: string;
  requestedBy: string;
  signedBy: string;
  totalCounter: number;
  transactionTypeCounter: number;
  /** In dinars, two decimals. Positive for refunds too (see transactionType). */
  totalAmount: number;
  issuedAt: Date;
  invoiceType: SufInvoiceType;
  transactionType: SufTransactionType;
  buyerId: string | null;
}

export interface SufItem {
  name: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  vatLabel: string | null;
  vatRate: number | null;
  gtin: string | null;
}

export interface SufDetails {
  sellerTin: string | null;
  sellerName: string | null;
  sellerAddress: string | null;
  sellerCity: string | null;
  items: SufItem[];
  payments: Array<{ method: PaymentMethod; amount: number }>;
  journal: string | null;
}

/**
 * Finds the verification link in scanned QR text or a pasted link and returns
 * its `vl` value and a canonical URL. Only suf.purs.gov.rs links are accepted
 * (the server fetches it, so no other host may ever be requested).
 */
export function parseSufLink(text: string): { vl: string; url: string } {
  const match = text.trim().match(/https?:\/\/[^\s]+/i);
  let u: URL;
  try {
    u = new URL(match?.[0] ?? text.trim());
  } catch {
    throw new ReceiptLinkError('Not a fiscal receipt link');
  }
  if (u.hostname.toLowerCase() !== SUF_HOST) throw new ReceiptLinkError('Not a Serbian fiscal receipt (suf.purs.gov.rs) link');
  // A "+" left unencoded in the QR becomes a space after URL decoding; base64 has no spaces.
  const vl = u.searchParams.get('vl')?.replace(/ /g, '+');
  if (!vl || !/^[A-Za-z0-9+/=_-]+$/.test(vl) || vl.length > 4000) throw new ReceiptLinkError('The link has no receipt data');
  return { vl, url: `${SUF_ORIGIN}/v/?vl=${encodeURIComponent(vl)}` };
}

/** Header fields of the `vl` payload (Tehnički vodič, verification URL format). */
export function decodeVl(vl: string): SufHeader {
  const b = Buffer.from(vl.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  // version 1 + 8 + 8 + 4 + 4 + 8 + 8 + 1 + 1 + 1 (buyer id length)
  if (b.length < 44) throw new ReceiptLinkError('The receipt data is incomplete');
  let o = 0;
  const version = b[o++];
  if (version < 2 || version > 3) throw new ReceiptLinkError(`Unknown receipt format (version ${version})`);
  const ascii = (n: number) => {
    const s = b.toString('latin1', o, o + n);
    o += n;
    return s;
  };
  const requestedBy = ascii(8);
  const signedBy = ascii(8);
  if (!/^[A-Z0-9]{8}$/.test(requestedBy) || !/^[A-Z0-9]{8}$/.test(signedBy)) throw new ReceiptLinkError('The receipt data is not valid');
  const totalCounter = b.readUInt32LE(o);
  o += 4;
  const transactionTypeCounter = b.readUInt32LE(o);
  o += 4;
  const amount = b.readBigUInt64LE(o);
  o += 8;
  const millis = b.readBigUInt64BE(o);
  o += 8;
  const invoiceType = INVOICE_TYPES[b[o++]];
  const tx = b[o++];
  const buyerLen = b[o++];
  if (!invoiceType || tx > 1 || o + buyerLen > b.length) throw new ReceiptLinkError('The receipt data is not valid');
  const buyerId = buyerLen ? b.toString('utf8', o, o + buyerLen) : null;
  return {
    invoiceNumber: `${requestedBy}-${signedBy}-${totalCounter}`,
    requestedBy,
    signedBy,
    totalCounter,
    transactionTypeCounter,
    // Amount is in 1/10000 of a dinar.
    totalAmount: Number(amount) / 10000,
    issuedAt: new Date(Number(millis)),
    invoiceType,
    transactionType: tx === 1 ? 'refund' : 'sale',
    buyerId,
  };
}

// ---------- verification page ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeHtml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const stripTags = (s: string) => decodeHtml(s.replace(/<[^>]*>/g, '')).trim();

/** Text of the element with this id (the page labels each value, e.g. id="tinLabel"). */
export function textById(html: string, id: string): string | null {
  const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)</`, 'i'));
  const v = m ? stripTags(m[1]) : '';
  return v || null;
}

/** "98.100,00" -> 98100. Also accepts "98100.00". */
export function parseAmount(s: string): number {
  const t = s.replace(/\s/g, '');
  const n = /,\d{1,4}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${s}`);
  return n;
}

/** "Kafa espresso (kom)" -> name "Kafa espresso", unit "kom". */
export function splitUnit(raw: string): { name: string; unit: string | null } {
  const m = raw.trim().match(/^(.*?)\s*\(([\p{L}.]{1,6})\)$/u);
  return m && m[1] ? { name: m[1].trim(), unit: m[2].toLowerCase() } : { name: raw.trim(), unit: null };
}

const PAYMENT_LABELS: Array<[RegExp, PaymentMethod]> = [
  [/^(готовина|gotovina)$/i, 'cash'],
  [/^(платна картица|platna kartica)$/i, 'card'],
  [/^(пренос на рачун|prenos na račun|prenos na racun)$/i, 'transfer'],
  [/^(чек|ček|cek)$/i, 'check'],
  [/^(ваучер|vaučer|vaucer)$/i, 'voucher'],
  [/^(инстант плаћање|instant plaćanje|instant placanje)$/i, 'instant'],
  [/^(друго безготовинско плаћање|drugo bezgotovinsko plaćanje)$/i, 'other'],
];

/**
 * Line items and payments from the receipt journal (the printed receipt text).
 * Items look like:
 *   Kafa espresso (kom) (Ђ)
 *            180,00          2         360,00
 */
export function parseJournal(journal: string): Pick<SufDetails, 'items' | 'payments'> {
  const lines = journal.split(/\r?\n/);
  const items: SufItem[] = [];
  const payments: SufDetails['payments'] = [];
  const header = lines.findIndex((l) => /^\s*(назив|naziv)\s+(цена|cena)\s+(кол|kol)/i.test(l));
  if (header >= 0) {
    let name: string[] = [];
    for (let i = header + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*-{5,}/.test(line) || /^\s*={5,}/.test(line)) break;
      const nums = line.match(/^\s*(-?[\d.]+,\d{2})\s+(-?[\d.,]+)\s+(-?[\d.]+,\d{2})\s*$/);
      if (nums && name.length) {
        const full = name.join(' ').replace(/\s+/g, ' ').trim();
        const label = full.match(/\s*\(([\p{L}])\)$/u);
        const { name: n, unit } = splitUnit(label ? full.slice(0, label.index) : full);
        items.push({ name: n, unit, unitPrice: parseAmount(nums[1]), quantity: parseAmount(nums[2]), total: parseAmount(nums[3]), vatLabel: label?.[1] ?? null, vatRate: null, gtin: null });
        name = [];
      } else if (line.trim()) {
        name.push(line.trim());
      }
    }
  }
  for (const line of lines) {
    const m = line.match(/^\s*([^:]+?):\s+(-?[\d.]+,\d{2})\s*$/);
    if (!m) continue;
    const method = PAYMENT_LABELS.find(([re]) => re.test(m[1].trim()))?.[1];
    if (method) payments.push({ method, amount: parseAmount(m[2]) });
  }
  return { items, payments };
}

interface SpecItem {
  gtin?: string | null;
  name?: string;
  quantity?: number;
  total?: number;
  unitPrice?: number;
  label?: string | null;
  labelRate?: number | null;
}

const mapSpecItem = (s: SpecItem): SufItem => {
  const { name, unit } = splitUnit(s.name ?? '');
  return {
    name,
    unit,
    quantity: Number(s.quantity ?? 0),
    unitPrice: Number(s.unitPrice ?? 0),
    total: Number(s.total ?? 0),
    vatLabel: s.label ?? null,
    vatRate: s.labelRate ?? null,
    gtin: s.gtin || null,
  };
};

/** Seller and journal from the verification page HTML. */
export function parseVerificationPage(html: string) {
  const journal = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  return {
    sellerTin: textById(html, 'tinLabel'),
    sellerName: textById(html, 'shopFullNameLabel'),
    sellerAddress: textById(html, 'addressLabel'),
    sellerCity: textById(html, 'cityLabel'),
    invoiceNumber: html.match(/viewModel\.InvoiceNumber\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? textById(html, 'invoiceNumberLabel'),
    token: html.match(/viewModel\.Token\(\s*['"]([^'"]+)['"]\s*\)/)?.[1] ?? null,
    journal: journal ? decodeHtml(journal[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')) : null,
  };
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;

async function readText(res: Response) {
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('Response too large');
  return text;
}

/**
 * Fetches seller, items and payments for a receipt. Items come from the page's
 * own "specifications" endpoint; if that is unavailable, from the journal text.
 */
export async function scrapeSuf(url: string, fetchImpl: Fetch = fetch): Promise<SufDetails> {
  const pageRes = await fetchImpl(url, {
    headers: { Accept: 'text/html', 'Accept-Language': 'sr-RS,sr;q=0.9' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (new URL(pageRes.url || url).hostname !== SUF_HOST) throw new Error('Unexpected redirect');
  if (!pageRes.ok) throw new Error(`Verification page returned ${pageRes.status}`);
  const page = parseVerificationPage(await readText(pageRes));
  const fromJournal = page.journal ? parseJournal(page.journal) : { items: [], payments: [] };

  let items = fromJournal.items;
  if (page.invoiceNumber && page.token) {
    try {
      const specRes = await fetchImpl(`${SUF_ORIGIN}/specifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({ invoiceNumber: page.invoiceNumber, token: page.token }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const spec = JSON.parse(await readText(specRes)) as { success?: boolean; items?: SpecItem[] };
      if (specRes.ok && spec.success !== false && Array.isArray(spec.items) && spec.items.length) items = spec.items.map(mapSpecItem);
    } catch {
      // Journal items are a complete fallback.
    }
  }
  if (!items.length && !page.sellerTin) throw new Error('Could not read the receipt from the verification page');
  return {
    sellerTin: page.sellerTin,
    sellerName: page.sellerName,
    sellerAddress: page.sellerAddress,
    sellerCity: page.sellerCity,
    items,
    payments: fromJournal.payments,
    journal: page.journal,
  };
}
