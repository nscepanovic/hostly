import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { phoneDigitForms } from '@hostly/shared';
import { env } from '../config/env';

/**
 * Field-level encryption for personal data (AES-256-GCM) plus blind indexes
 * (HMAC-SHA256) so encrypted fields stay searchable without storing plaintext.
 *
 * Ciphertext format: `enc1:<keyId>:<base64url(iv | ciphertext | tag)>`.
 * Several keys can be configured so old data stays readable after a key
 * rotation; new writes always use the active key.
 */

const PREFIX = 'enc1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

interface Keys {
  activeId: string;
  byId: Map<string, Buffer>;
  blind: Buffer;
}

let keys: Keys | undefined;

/** Fixed keys for local development and tests only; production refuses to start without real ones. */
const devKey = (label: string) => createHash('sha256').update(`hostly-dev-only-${label}`).digest();

function decodeKey(b64: string, name: string): Buffer {
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded (openssl rand -base64 32)`);
  return key;
}

function loadKeys(): Keys {
  if (keys) return keys;
  const e = env();
  const byId = new Map<string, Buffer>();
  if (e.DATA_ENCRYPTION_KEYS) {
    for (const entry of e.DATA_ENCRYPTION_KEYS.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [id, b64] = entry.split(':');
      if (!id || !b64 || !/^\w+$/.test(id)) throw new Error('DATA_ENCRYPTION_KEYS must look like "1:<base64>,2:<base64>"');
      byId.set(id, decodeKey(b64, `DATA_ENCRYPTION_KEYS[${id}]`));
    }
  }
  if (!byId.size) {
    if (e.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEYS must be set in production');
    byId.set('dev', devKey('data'));
  }
  const activeId = e.DATA_ENCRYPTION_KEY_ID || [...byId.keys()].at(-1)!;
  if (!byId.has(activeId)) throw new Error(`DATA_ENCRYPTION_KEY_ID "${activeId}" is not in DATA_ENCRYPTION_KEYS`);

  let blind: Buffer;
  if (e.BLIND_INDEX_KEY) blind = decodeKey(e.BLIND_INDEX_KEY, 'BLIND_INDEX_KEY');
  else if (e.NODE_ENV === 'production') throw new Error('BLIND_INDEX_KEY must be set in production');
  else blind = devKey('blind');

  keys = { activeId, byId, blind };
  return keys;
}

export const isEncrypted = (value: string) => value.startsWith(PREFIX);

export function encrypt(plain: string): string {
  const k = loadKeys();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', k.byId.get(k.activeId)!, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${PREFIX}${k.activeId}:${Buffer.concat([iv, ct, cipher.getAuthTag()]).toString('base64url')}`;
}

/** Decrypts a value; plaintext from before encryption was enabled passes through unchanged. */
export function decrypt(value: string): string {
  if (!isEncrypted(value)) return value;
  const rest = value.slice(PREFIX.length);
  const sep = rest.indexOf(':');
  const keyId = rest.slice(0, sep);
  const key = loadKeys().byId.get(keyId);
  if (!key) throw new Error(`No decryption key with id "${keyId}"`);
  const raw = Buffer.from(rest.slice(sep + 1), 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** True when a ciphertext was written with an older key (re-encrypt on rotation). */
export const needsReencrypt = (value: string) => isEncrypted(value) && !value.startsWith(`${PREFIX}${loadKeys().activeId}:`);

// ---------- blind indexes ----------

/** HMAC of a typed value, truncated to 128 bits. Equal inputs give equal tokens; nothing else is revealed. */
export function blindIndex(kind: string, value: string): string {
  return createHmac('sha256', loadKeys().blind).update(`${kind}:${value}`).digest().subarray(0, 16).toString('base64url');
}

/** Lowercase, strip diacritics (Jovanović -> jovanovic, Đorđević -> dordevic). */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const words = (s: string) => foldText(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const MAX_PREFIX = 20;

function prefixes(s: string, min: number, max = MAX_PREFIX): string[] {
  const out: string[] = [];
  for (let n = min; n <= Math.min(s.length, max); n++) out.push(s.slice(0, n));
  return out;
}

export const emailIndex = (email: string | null | undefined) => (email ? blindIndex('email', email.trim().toLowerCase()) : null);
export const phoneIndex = (e164: string | null | undefined) => (e164 ? blindIndex('phone', e164) : null);

/**
 * Search tokens for a guest: word prefixes of first and last name, prefixes of
 * the email (whole address and its parts), and digit prefixes/suffixes of the
 * phone in both national and international form.
 */
export function guestSearchTokens(g: { firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null }): string[] {
  const tokens = new Set<string>();
  for (const w of [...words(g.firstName ?? ''), ...words(g.lastName ?? '')]) {
    for (const p of prefixes(w, 2)) tokens.add(blindIndex('n', p));
  }
  if (g.email) {
    const email = g.email.trim().toLowerCase();
    for (const p of prefixes(email, 3, 40)) tokens.add(blindIndex('e', p));
    for (const w of words(email)) for (const p of prefixes(w, 2)) tokens.add(blindIndex('e', p));
  }
  if (g.phone) {
    const { intl, national } = phoneDigitForms(g.phone);
    for (const form of [intl, national]) {
      for (const p of prefixes(form, 3)) tokens.add(blindIndex('p', p));
      // Last digits ("4772") are a common way to look someone up.
      for (let n = 4; n < form.length; n++) tokens.add(blindIndex('p', form.slice(-n)));
    }
  }
  return [...tokens];
}

/**
 * Turns a search box query into token groups: a row matches when, for every
 * group, it has at least one of the group's tokens.
 */
export function guestQueryTokens(query: string): string[][] {
  const q = query.trim();
  if (!q) return [];
  // Mostly digits: a phone search ("064 99", "+381 64", "4772").
  if (/^[\d\s+()./-]+$/.test(q)) {
    const digits = q.replace(/^\s*(\+|00)/, '').replace(/\D/g, '');
    return digits.length >= 3 ? [[blindIndex('p', digits.slice(0, MAX_PREFIX))]] : [];
  }
  const groups: string[][] = [];
  if (/[@.]/.test(q) && !/\s/.test(q)) {
    // Looks like (part of) an email address.
    groups.push([blindIndex('e', q.toLowerCase().slice(0, 40))]);
    return groups;
  }
  for (const w of words(q)) {
    if (w.length < 2) continue;
    const p = w.slice(0, MAX_PREFIX);
    groups.push([blindIndex('n', p), blindIndex('e', p)]);
  }
  return groups;
}

export type GuestField = 'name' | 'phone' | 'email';

/**
 * Token groups for as-you-type suggestions on one form field. Stricter than
 * guestQueryTokens: a name field only matches names, an email field only emails.
 */
export function guestFieldQueryTokens(field: GuestField, query: string): string[][] {
  const q = query.trim();
  if (field === 'phone') return /\d/.test(q) ? guestQueryTokens(q.replace(/[^\d\s+()./-]/g, '')) : [];
  if (field === 'email') return q.length >= 3 ? [[blindIndex('e', q.toLowerCase().slice(0, 40))]] : [];
  return words(q)
    .filter((w) => w.length >= 2)
    .map((w) => [blindIndex('n', w.slice(0, MAX_PREFIX))]);
}
