import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { env } from '../src/config/env';
import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { seed } from '../src/db/seed';
import { EmailAdapter } from '../src/messaging/email.adapter';

/** Wipes the test database, migrates and seeds it. */
export async function resetDatabase() {
  const url = env().DATABASE_URL;
  if (!url.includes('test')) throw new Error(`Refusing to reset non-test database: ${url}`);
  const pool = new Pool({ connectionString: url });
  await pool.query('drop schema if exists drizzle cascade; drop schema public cascade; create schema public; create extension if not exists btree_gist;');
  await pool.end();
  await runMigrations(url);
  const { db, pool: seedPool } = createDb(url);
  const result = await seed(db, { slug: 'test', password: 'secret123' });
  await seedPool.end();
  return result;
}

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, email: app.get(EmailAdapter) };
}

/** Logs in and returns a supertest agent carrying the session cookie and CSRF header. */
export async function login(app: INestApplication, email: string, password = 'secret123') {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return {
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => agent.post(url).set('x-hostly', '1').send(body ?? {}),
    patch: (url: string, body?: object) => agent.patch(url).set('x-hostly', '1').send(body ?? {}),
    put: (url: string, body?: object) => agent.put(url).set('x-hostly', '1').send(body ?? {}),
    delete: (url: string) => agent.delete(url).set('x-hostly', '1'),
  };
}

export type Client = Awaited<ReturnType<typeof login>>;
