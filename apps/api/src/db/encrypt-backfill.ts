import type { Pool, PoolClient } from 'pg';
import { blindIndex, decrypt, emailIndex, encrypt, isEncrypted, needsReencrypt } from '../common/crypto';
import { customerIndexes } from '../customers/customer-indexes';

/** Columns holding personal data, per table (all stored as `enc1:` ciphertext). */
const ENCRYPTED: Record<string, string[]> = {
  users: ['email', 'name'],
  customers: ['first_name', 'last_name', 'phone', 'email', 'birthday', 'company', 'notes'],
  reservations: ['first_name', 'last_name', 'phone', 'email', 'notes', 'decline_reason'],
  waiting_entries: ['guest_name', 'phone', 'notes'],
  messages: ['recipient'],
  audit_log: ['before', 'after'],
  platform_admins: ['email', 'name'],
};

const BATCH = 500;

async function tableExists(c: PoolClient, table: string) {
  const r = await c.query(`select to_regclass($1) as t`, [`public.${table}`]);
  return !!r.rows[0].t;
}

/** Encrypts plaintext values and re-encrypts values written with an old key. Idempotent. */
async function encryptTable(c: PoolClient, table: string, cols: string[]): Promise<number> {
  const list = cols.map((col) => `"${col}"`).join(', ');
  let done = 0;
  // Simple keyset scan over all rows; only rows that need it are written.
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { rows } = await c.query(`select id, ${list} from "${table}" where id > $1 order by id limit ${BATCH}`, [lastId]);
    if (!rows.length) break;
    for (const row of rows) {
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const col of cols) {
        const v = row[col] as string | null;
        if (v === null || (isEncrypted(v) && !needsReencrypt(v))) continue;
        values.push(encrypt(decrypt(v)));
        updates.push(`"${col}" = $${values.length}`);
      }
      if (updates.length) {
        values.push(row.id);
        await c.query(`update "${table}" set ${updates.join(', ')} where id = $${values.length}`, values);
        done++;
      }
    }
    lastId = rows.at(-1).id;
  }
  return done;
}

/** Rebuilds blind indexes. `all` after a BLIND_INDEX_KEY change, otherwise only rows missing them. */
async function indexCustomers(c: PoolClient, all: boolean): Promise<number> {
  let lastId = '00000000-0000-0000-0000-000000000000';
  let done = 0;
  const where = all
    ? 'true'
    : `((phone is not null and phone_bidx is null) or (email is not null and email_bidx is null)
        or (search_tokens = '{}' and (first_name is not null or last_name is not null or phone is not null or email is not null)))`;
  for (;;) {
    const { rows } = await c.query(
      `select id, first_name, last_name, phone, email from customers where id > $1 and ${where} order by id limit ${BATCH}`,
      [lastId],
    );
    if (!rows.length) break;
    for (const r of rows) {
      const plain = (v: string | null) => (v === null ? null : decrypt(v));
      const idx = customerIndexes({ firstName: plain(r.first_name), lastName: plain(r.last_name), phone: plain(r.phone), email: plain(r.email) });
      await c.query('update customers set phone_bidx = $1, email_bidx = $2, search_tokens = $3 where id = $4', [
        idx.phoneIndex,
        idx.emailIndex,
        idx.searchTokens,
        r.id,
      ]);
      done++;
    }
    lastId = rows.at(-1).id;
  }
  return done;
}

async function indexEmails(c: PoolClient, table: string, all: boolean): Promise<number> {
  if (!(await tableExists(c, table))) return 0;
  const { rows } = await c.query(`select id, email from "${table}" ${all ? '' : 'where email_bidx is null'}`);
  for (const r of rows) await c.query(`update "${table}" set email_bidx = $1 where id = $2`, [emailIndex(decrypt(r.email)), r.id]);
  await c.query(`alter table "${table}" alter column email_bidx set not null`);
  return rows.length;
}

/**
 * Runs after the SQL migrations: encrypts personal data left in plaintext,
 * re-encrypts with the active key, and (re)builds blind indexes. Safe to run
 * on every deploy; it only touches rows that need it.
 */
export async function encryptAndIndex(pool: Pool, log: (msg: string) => void = () => undefined) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const fingerprint = blindIndex('meta', 'fingerprint');
    const { rows } = await c.query(`select value from app_meta where key = 'blind_index_fingerprint'`);
    const reindexAll = rows.length > 0 && rows[0].value !== fingerprint;

    for (const [table, cols] of Object.entries(ENCRYPTED)) {
      if (!(await tableExists(c, table))) continue;
      const n = await encryptTable(c, table, cols);
      if (n) log(`encrypted ${n} rows in ${table}`);
    }
    const customers = await indexCustomers(c, reindexAll);
    if (customers) log(`indexed ${customers} customers`);
    for (const table of ['users', 'platform_admins']) {
      const n = await indexEmails(c, table, reindexAll);
      if (n) log(`indexed ${n} ${table}`);
    }
    await c.query(
      `insert into app_meta (key, value) values ('blind_index_fingerprint', $1) on conflict (key) do update set value = excluded.value`,
      [fingerprint],
    );
    await c.query('commit');
  } catch (err) {
    await c.query('rollback');
    throw err;
  } finally {
    c.release();
  }
}
