import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { env } from '../config/env';
import { createDb, type Db } from './client';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');

const created = () => createDb(env().DATABASE_URL);
let instance: ReturnType<typeof created> | undefined;
const get = () => (instance ??= created());

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => get().pool },
    { provide: DB, useFactory: () => get().db },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
    instance = undefined;
  }
}

export const InjectDb = () => Inject(DB);
export type { Db };
