import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './common/decorators';
import { InjectDb, type Db } from './db/db.module';

@Controller('health')
export class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Public()
  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { ok: true };
  }
}
