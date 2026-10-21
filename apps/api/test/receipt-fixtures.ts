import { randomBytes } from 'node:crypto';

/** Builds a receipt QR link in the official vl layout (header + random signature bytes). Test use only. */
export function receiptLink(opts: { counter: number; amount: number; at: Date; type?: number; refund?: boolean; device?: string }) {
  const device = opts.device ?? 'TESTDEV1';
  const b = Buffer.alloc(44);
  let o = 0;
  b[o++] = 3;
  o += b.write(device, o, 'latin1');
  o += b.write(device, o, 'latin1');
  o = b.writeUInt32LE(opts.counter, o);
  o = b.writeUInt32LE(opts.counter, o);
  o = b.writeBigUInt64LE(BigInt(Math.round(opts.amount * 10000)), o);
  o = b.writeBigUInt64BE(BigInt(opts.at.getTime()), o);
  b[o++] = opts.type ?? 0;
  b[o++] = opts.refund ? 1 : 0;
  b[o++] = 0;
  const vl = Buffer.concat([b, randomBytes(528)]).toString('base64');
  return { url: `https://suf.purs.gov.rs/v/?vl=${encodeURIComponent(vl)}`, invoiceNumber: `${device}-${device}-${opts.counter}` };
}

/**
 * Stand-in for suf.purs.gov.rs in API tests: a verification page with the
 * element ids the scraper reads, and the specifications endpoint.
 */
export function fakeSuf(items: Record<string, Array<{ name: string; quantity: number; unitPrice: number }>>, payment = 'Платна картица') {
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/specifications')) {
      const invoice = new URLSearchParams(String(init?.body)).get('invoiceNumber')!;
      const list = items[invoice] ?? [];
      const body = { success: true, items: list.map((i) => ({ name: `${i.name} (kom)`, quantity: i.quantity, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice, label: 'Ђ', labelRate: 20, gtin: null })) };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    }
    const vl = new URL(url).searchParams.get('vl')!;
    const b = Buffer.from(vl, 'base64');
    const device = b.toString('latin1', 1, 9);
    const invoice = `${device}-${device}-${b.readUInt32LE(17)}`;
    const total = (items[invoice] ?? []).reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    const amount = total.toLocaleString('sr-RS', { minimumFractionDigits: 2 });
    const html = `<html><body>
      <span id="tinLabel">100000001</span><span id="shopFullNameLabel">1-TEST RESTORAN</span>
      <span id="addressLabel">ULICA 1</span><span id="cityLabel">BEOGRAD</span>
      <pre>Назив   Цена   Кол.   Укупно\n-----\n${payment}:   ${amount}\n=====</pre>
      <script>viewModel.InvoiceNumber('${invoice}'); viewModel.Token('tok-${invoice}');</script>
    </body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  return { fetcher, calls };
}
