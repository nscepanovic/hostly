import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}
