import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../config/env';
import { createDb } from './client';
import { encryptAndIndex } from './encrypt-backfill';

/** SQL migrations, then encryption/blind-index maintenance (idempotent). */
export async function runMigrations(url = env().DATABASE_URL, log: (msg: string) => void = () => undefined) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') });
    await encryptAndIndex(pool, log);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations(undefined, (msg) => console.log(msg))
    .then(() => {
      console.log('Migrations applied');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
