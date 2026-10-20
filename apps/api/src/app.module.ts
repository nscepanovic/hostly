import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { webDistPath } from './config/env';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { RealtimeModule } from './realtime/realtime.module';
import { RestaurantModule } from './restaurant/restaurant.module';

const staticModules = (): DynamicModule[] =>
  webDistPath()
    ? [ServeStaticModule.forRoot({ rootPath: webDistPath(), exclude: ['/api/{*path}', '/socket.io/{*path}'] })]
    : [];

@Module({
  imports: [
    ...staticModules(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1000 }]),
    ScheduleModule.forRoot(),
    DbModule,
    CommonModule,
    AuthModule,
    RealtimeModule,
    RestaurantModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
