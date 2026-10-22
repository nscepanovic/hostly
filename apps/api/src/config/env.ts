import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** Loads the nearest .env walking up from the working directory (repo root in dev and under pm2). */
function loadEnvFile() {
  if (process.env.HOSTLY_ENV_FILE) {
    loadDotenv({ path: process.env.HOSTLY_ENV_FILE, quiet: true });
    return;
  }
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      loadDotenv({ path: file, quiet: true });
      return;
    }
    dir = dirname(dir);
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().default('postgres://hostly:hostly@localhost:5433/hostly'),
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  JWT_TTL_HOURS: z.coerce.number().int().min(1).default(24 * 14),
  /** Public base URL of the app, used in guest email links. */
  APP_URL: z.string().default('http://localhost:5173'),
  /** Comma separated origins allowed to call the API with cookies (dev: the Vite server). */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Built SPA to serve from the API in production. Empty = do not serve. */
  WEB_DIST: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_FROM: z.string().default('Hostly <no-reply@localhost>'),
  /** Run the day-before reminder job. */
  REMINDERS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Field encryption keys "id:base64(32 bytes)", comma separated; keep old ones after rotating. */
  DATA_ENCRYPTION_KEYS: z.string().default(''),
  /** Key id used for new writes (default: the last key listed). */
  DATA_ENCRYPTION_KEY_ID: z.string().default(''),
  /** HMAC key for searchable blind indexes, base64(32 bytes). Never change it without re-indexing. */
  BLIND_INDEX_KEY: z.string().default(''),
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().default(20),
  /** Web Push (VAPID) keys: `npx web-push generate-vapid-keys`. Without them, production sends no push. */
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  /** Contact for push services, "mailto:" or https URL. */
  VAPID_SUBJECT: z.string().default('mailto:support@hostly.app'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    loadEnvFile();
    cached = envSchema.parse(process.env);
    if (cached.NODE_ENV === 'production' && cached.JWT_SECRET === 'dev-only-secret-change-me-please') {
      throw new Error('JWT_SECRET must be set in production');
    }
  }
  return cached;
}

export const webDistPath = () => (env().WEB_DIST ? resolve(env().WEB_DIST) : '');
