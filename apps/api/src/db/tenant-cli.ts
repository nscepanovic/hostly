/* eslint-disable no-console */
import { parseArgs } from 'node:util';
import { asc, eq } from 'drizzle-orm';
import { env } from '../config/env';
import { isUniqueViolation } from '../common/pg-errors';
import { createDb, type Db } from './client';
import * as s from './schema';
import { createPlatformAdmin, createRestaurant, shareGuests, unshareGuests } from './tenant';

const usage = `Hostly tenant administration

  pnpm tenant create --name "Kafana Zlatni Ključ" --slug zlatni-kljuc \\
      --owner-email vlasnik@example.com --owner-name "Marko Marković" --password '<min 8 chars>' \\
      [--timezone Europe/Belgrade] [--language sr|en] [--share-guests-with <slug>]
  pnpm tenant share-guests --slug <slug> --with <slug>
      Both restaurants see the same guests from now on. Guests with the same phone are merged.
  pnpm tenant unshare-guests --slug <slug>
      The restaurant gets a private guest database again (with a copy of its own guests).
  pnpm tenant list
  pnpm tenant admin-create --email you@hostly.rs --name "Your Name" --password '<min 10 chars>'
      Platform admin account for the admin panel at /admin.
`;

async function bySlug(db: Db, slug: string) {
  const [r] = await db.select().from(s.restaurants).where(eq(s.restaurants.slug, slug));
  if (!r) throw new Error(`No restaurant with slug "${slug}"`);
  return r;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values: v } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      with: { type: 'string' },
      'owner-email': { type: 'string' },
      'owner-name': { type: 'string' },
      password: { type: 'string' },
      timezone: { type: 'string' },
      language: { type: 'string' },
      'share-guests-with': { type: 'string' },
      email: { type: 'string' },
    },
  });

  const { db, pool } = createDb(env().DATABASE_URL);
  try {
    switch (command) {
      case 'create': {
        if (!v.name || !v.slug || !v['owner-email'] || !v.password) throw new Error(usage);
        const shareWith = v['share-guests-with'] ? await bySlug(db, v['share-guests-with']) : undefined;
        const { restaurant, owner } = await db.transaction((tx) =>
          createRestaurant(tx, {
            name: v.name!,
            slug: v.slug!,
            timezone: v.timezone,
            defaultLanguage: v.language === 'en' ? 'en' : 'sr',
            owner: { email: v['owner-email']!, name: v['owner-name'] ?? v['owner-email']!, password: v.password! },
            guestBookId: shareWith?.guestBookId,
          }),
        );
        console.log(`Created "${restaurant.name}" (slug: ${restaurant.slug})${shareWith ? `, sharing guests with "${shareWith.name}"` : ''}`);
        console.log(`  owner login: ${owner.email}`);
        console.log(`  booking page: ${env().APP_URL.replace(/\/$/, '')}/book/${restaurant.slug}`);
        break;
      }
      case 'share-guests': {
        if (!v.slug || !v.with) throw new Error(usage);
        const a = await bySlug(db, v.slug);
        const b = await bySlug(db, v.with);
        const res = await db.transaction((tx) => shareGuests(tx, a.id, b.id));
        console.log(`"${a.name}" now shares guests with "${b.name}": ${res.moved} guests moved, ${res.merged} merged by phone.`);
        break;
      }
      case 'unshare-guests': {
        if (!v.slug) throw new Error(usage);
        const a = await bySlug(db, v.slug);
        const res = await db.transaction((tx) => unshareGuests(tx, a.id));
        console.log(`"${a.name}" has a private guest database again (${res.copied} guests copied).`);
        break;
      }
      case 'admin-create': {
        if (!v.email || !v.password) throw new Error(usage);
        const admin = await db.transaction((tx) => createPlatformAdmin(tx, { email: v.email!, name: v.name ?? v.email!, password: v.password! }));
        console.log(`Created platform admin ${admin.email}. Sign in at ${env().APP_URL.replace(/\/$/, '')}/admin`);
        break;
      }
      case 'list': {
        const rows = await db.select().from(s.restaurants).orderBy(asc(s.restaurants.guestBookId), asc(s.restaurants.name));
        const groups = new Map<string, string[]>();
        for (const r of rows) groups.set(r.guestBookId, [...(groups.get(r.guestBookId) ?? []), `${r.name} (${r.slug})`]);
        for (const names of groups.values()) console.log(names.length > 1 ? `shared guests: ${names.join(', ')}` : `private: ${names[0]}`);
        break;
      }
      default:
        console.log(usage);
        process.exitCode = command ? 1 : 0;
    }
  } catch (err) {
    console.error(isUniqueViolation(err) ? 'That slug or email is already taken.' : (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
