import { createHash } from 'node:crypto';
import { decrypt, encrypt, foldText, guestQueryTokens, guestSearchTokens, isEncrypted } from './crypto';

const matches = (stored: string[], query: string) => {
  const set = new Set(stored);
  const groups = guestQueryTokens(query);
  return groups.length > 0 && groups.every((g) => g.some((t) => set.has(t)));
};

describe('field encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const c = encrypt('Jovanović Sanja +381637735033');
    expect(isEncrypted(c)).toBe(true);
    expect(c).not.toContain('Sanja');
    expect(decrypt(c)).toBe('Jovanović Sanja +381637735033');
  });

  it('uses a fresh IV, so equal values do not look equal', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('detects tampering', () => {
    const c = encrypt('secret');
    const tampered = c.slice(0, -2) + (c.endsWith('A') ? 'B' : 'A') + c.slice(-1);
    expect(() => decrypt(tampered)).toThrow();
  });

  it('passes legacy plaintext through (for the migration window)', () => {
    expect(decrypt('plain value')).toBe('plain value');
  });

  it('reads data written with an older key after rotation', () => {
    const oldKey = createHash('sha256').update('old').digest().toString('base64');
    const newKey = createHash('sha256').update('new').digest().toString('base64');
    // Fresh module instances so the env-derived key ring is rebuilt.
    const load = (keys: string, active: string) => {
      process.env.DATA_ENCRYPTION_KEYS = keys;
      process.env.DATA_ENCRYPTION_KEY_ID = active;
      let mod!: typeof import('./crypto');
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        mod = require('./crypto');
      });
      return mod;
    };
    try {
      const written = load(`1:${oldKey}`, '1').encrypt('guest');
      const rotated = load(`1:${oldKey},2:${newKey}`, '2');
      expect(rotated.decrypt(written)).toBe('guest');
      expect(rotated.needsReencrypt(written)).toBe(true);
      expect(rotated.encrypt('x').startsWith('enc1:2:')).toBe(true);
      expect(() => load(`2:${newKey}`, '2').decrypt(written)).toThrow(/No decryption key/);
    } finally {
      delete process.env.DATA_ENCRYPTION_KEYS;
      delete process.env.DATA_ENCRYPTION_KEY_ID;
    }
  });
});

describe('searchable blind indexes', () => {
  const tokens = guestSearchTokens({ firstName: 'Sanja', lastName: 'Jovanović', email: 'Sanja.J@example.com', phone: '+381637735033' });

  it('finds first and last name by prefix, ignoring case and diacritics', () => {
    for (const q of ['sanja', 'San', 'jovanović', 'jovanovic', 'JOVAN', 'sanja jov', 'jov san']) expect(matches(tokens, q)).toBe(true);
    expect(matches(tokens, 'anja')).toBe(false); // prefixes only, not infixes
    expect(matches(tokens, 'sanja petrovic')).toBe(false);
  });

  it('finds email by full address, prefix and parts', () => {
    for (const q of ['sanja.j@example.com', 'SANJA.J@EX', 'example']) expect(matches(tokens, q)).toBe(true);
  });

  it('finds phone in local, international and partial forms', () => {
    for (const q of ['063 773 5033', '0637735033', '+381 63 773', '00381637', '381637', '5033', '7735033']) expect(matches(tokens, q)).toBe(true);
    expect(matches(tokens, '064')).toBe(false);
  });

  it('stores no readable fragment of the data', () => {
    expect(tokens.join(' ')).not.toMatch(/sanja|jovan|381|example/i);
  });

  it('folds Serbian letters', () => {
    expect(foldText('Đorđević Čačak Šabac Žabalj')).toBe('dordevic cacak sabac zabalj');
  });
});
