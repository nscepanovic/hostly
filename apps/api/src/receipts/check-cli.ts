/**
 * Checks a receipt link against the live tax authority site and prints what
 * Hostly reads from it. Usage:
 *   pnpm --filter @hostly/api receipt:check "<link from the QR code>" [--save page.html]
 */
import { writeFileSync } from 'node:fs';
import { decodeVl, parseSufLink, parseVerificationPage, scrapeSuf } from './suf';

async function main() {
  const [link, flag, file] = process.argv.slice(2);
  if (!link) throw new Error('Usage: receipt:check "<receipt link>" [--save page.html]');
  const { vl, url } = parseSufLink(link);
  console.log('From the QR code (offline):');
  console.log(decodeVl(vl));
  if (flag === '--save' && file) {
    const html = await (await fetch(url)).text();
    writeFileSync(file, html);
    console.log(`\nSaved the verification page to ${file}`);
    console.log(parseVerificationPage(html));
  }
  console.log('\nFrom suf.purs.gov.rs:');
  console.dir(await scrapeSuf(url), { depth: 4 });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
