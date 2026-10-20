import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { env } from './config/env';

/** Shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: env().CORS_ORIGIN.split(','), credentials: true });
  app.enableShutdownHooks();
  // Cloudflare / reverse proxy in front: trust X-Forwarded-For for rate limiting.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
}
