import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../config/env';
import { createDb } from './client';

export async function runMigrations(url = env().DATABASE_URL) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied');
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
