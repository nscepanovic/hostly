# Hostly

Reservation and table management for restaurant hosts. It is a tablet-first PWA, designed for a portrait iPad on the host stand, and it also works on phones.

- **Floor plan**: live table states, a booked/waiting/priority list, tap a table to seat, complete, mark a no-show or move a party. Drag a reservation onto a table to assign it.
- **Reservations**: a fast form with a time grid and covers pad. Phone autocomplete fills in the guest from the customer database, and the best free table is suggested automatically. The form validates opening hours, party size, pacing and conflicts.
- **Realtime**: every tablet updates instantly over WebSocket. New online requests and tables that free up for the waiting list show a pop-up and play a chime.
- **Online booking widget**: `/book/:slug` (embeddable as an iframe) only offers times that actually have capacity. Guests get emails in their own language with confirm and cancel links.
- **Customers**: search, profile, visit history, visit/cancellation/no-show counters, and VIP/SVIP/blacklisted flags.
- **Timeline**: a grid of tables by 15-minute slots with pace per slot. Drag a bar to move it, drag its edge to change the return time.
- **Floor plan editor** (owner): table templates, drag, resize, rotate, multiple areas, and predefined table combinations.
- Serbian (default) and English UI. Dark theme by default, with a light theme.

## Stack

| Layer    | Choice                                                                 |
| -------- | ---------------------------------------------------------------------- |
| API      | NestJS 11 (TypeScript), REST + Socket.IO gateway                       |
| Database | PostgreSQL 14+ with Drizzle ORM, SQL migrations in `apps/api/drizzle`  |
| Web      | Vite + React 19 + TypeScript SPA, Tailwind 4, TanStack Query, Zustand  |
| Shared   | `packages/shared`: types, zod schemas, phone helpers, WS event names   |
| Auth     | Email + password, JWT in an httpOnly cookie, roles `owner` and `host`  |

```
apps/api          NestJS API (also serves the built SPA in production)
apps/web          React PWA
packages/shared   Types and zod schemas used by both
```

## Local setup

Requirements: Node 20+, pnpm 10, Docker (Docker Desktop on macOS).

```bash
# 1. Install and configure
pnpm install
cp .env.example .env            # defaults match the Docker database

# 2. Start Postgres 16 in Docker on localhost:5433 (user/password/db: hostly, plus hostly_test)
pnpm db:up

# 3. Schema and demo data
pnpm db:migrate
pnpm db:seed                    # add --reset via: pnpm --filter @hostly/api db:seed -- --reset

# 4. Run API (:3000) and web (:5173, proxies /api and /socket.io)
pnpm dev
```

Other database commands:

- `pnpm db:down` stops the container. Your data stays in the `hostly-db` volume.
- `pnpm db:reset` wipes the volume, then migrates and seeds again.
- The database listens on port 5433, so it doesn't clash with another Postgres on 5432. To use a different port, run `HOSTLY_DB_PORT=5434 pnpm db:up` and change `DATABASE_URL` to match.
- If you already run your own PostgreSQL 14+, skip Docker. Create a `hostly` role, the `hostly` and `hostly_test` databases, and point `DATABASE_URL` at them.

Open http://localhost:5173 and sign in with a seeded user (password `hostly123`, or `SEED_PASSWORD`):

| Role  | Email                    |
| ----- | ------------------------ |
| owner | `owner@restoran.local`   |
| host  | `host1@restoran.local`   |
| host  | `host2@restoran.local`   |

Public booking page: http://localhost:5173/book/restoran

Without `SMTP_HOST`, guest emails are not sent. They are printed to the API log instead, links included.

## Restaurants (SaaS tenants) and shared guests

Many restaurants run on one Hostly installation. Each one has its own staff accounts, floor plan, reservations, settings and booking page (`/book/<slug>`). The API scopes every request to the signed-in user's restaurant, and the e2e suite checks that one restaurant cannot read, change or link another's data.

**Guests live in a guest book.** By default every restaurant has its own private book, so the same phone number at two unrelated restaurants is two separate guests who can't see each other. Restaurants that should share guests (for example, several locations of one owner) point to the same book. They then see one guest record: VIP or blacklist flags, notes, tags, and visit history across all of them, with the restaurant shown for each visit.

Sharing is a platform operation, done at the request of both restaurants:

```bash
pnpm tenant create --name "Kafana Zlatni Ključ" --slug zlatni-kljuc \
  --owner-email vlasnik@example.com --owner-name "Marko Marković" --password '<min 8 chars>' \
  [--share-guests-with <slug>]                       # new restaurant, optionally joining a group's guests
pnpm tenant share-guests --slug zlatni-kljuc --with restoran   # start sharing; same-phone guests are merged
pnpm tenant unshare-guests --slug zlatni-kljuc                 # back to private, with a copy of its own guests
pnpm tenant list                                               # which restaurants share guests
pnpm tenant users                                              # all staff and admin accounts, decrypted
```

On the server, run these with `NODE_ENV=production` and the production `DATABASE_URL` in `.env`.

When a restaurant joins a group, its guests move into the shared book. A guest who already exists there with the same phone is merged: reservations are re-linked, blank fields are filled in, tags and notes are combined, and the stricter type wins (blacklisted > SVIP > VIP > regular). Settings shows owners who they share guests with.

Guest emails go out from the platform's `MAIL_FROM` address but under the restaurant's name, with Reply-To set to the restaurant's email.

## Admin panel (platform operators)

`/admin` is the Hostly operator panel. It has its own accounts and login, completely separate from restaurant staff: a separate session cookie scoped to `/api/admin`, and its own token type. A staff session can't open it, and an admin session can't use the restaurant app.

- **Overview:** restaurants (total, suspended, active in the last 7 days); reservations (24h, 7 days, 30 days) and covers; online share; no-show rate; online requests waiting; emails sent and failed; tablets connected right now; system health (database latency, uptime, memory, version); a 30-day chart of reservations created per day (with a table view).
- **Restaurants:** search; usage per restaurant (reservations, staff, tables, guests, live devices, last activity). Create a restaurant with its owner. On each restaurant you can:
  - suspend or reactivate it: staff are signed out at once, sessions stop working, and the booking page closes; guest cancel links keep working
  - share its guests with another restaurant, or stop sharing
  - add staff accounts and reset passwords
  - see its recent activity and failed emails
- **Activity:** staff actions across all restaurants (who, what, when).
- **Emails:** delivery log with status and errors, filterable by restaurant and status.

The panel shows counts and staff actions only. Guest personal data (names, phones, emails, notes, audit snapshots) never reaches it, and email recipients are masked (`j***@example.com`). Admin actions are recorded in the restaurant's activity log.

Create the first admin on the server (the dev seed creates `admin@hostly.local` / `hostly123-admin`):

```bash
pnpm tenant admin-create --email you@hostly.rs --name "Your Name" --password '<min 10 chars>'
```

## Personal data encryption

Personal data is encrypted in the database with AES-256-GCM. The key lives in the server's environment, never in the database, so a database dump or backup alone does not reveal it.

| Encrypted | Where |
| --- | --- |
| first name, last name, phone, email, birthday, company, notes | guests (`customers`) |
| first name, last name, phone, email, notes, decline reason | `reservations` |
| guest name, phone, notes | `waiting_entries` |
| recipient email | `messages` |
| before/after snapshots | `audit_log` |
| name, email | staff `users` (passwords are bcrypt hashes) |

**Search still works** through blind indexes: keyed HMAC-SHA256 tokens stored beside the ciphertext, built with a separate key.

- First name and last name: word prefixes, ignoring case and diacritics (`jov`, `jovanovic` and `Jovanović` all match).
- Email: whole address, prefixes, and parts (`sanja.j@ex`, `example`).
- Phone: digit prefixes in local and international form, plus last digits (`064 99`, `+381 64`, `4772`).
- Exact lookups use dedicated indexes: phone autocomplete, guest uniqueness per guest book, and staff login by email.

Encryption happens in the Drizzle column types (`apps/api/src/db/schema.ts`), so application code reads and writes plaintext. Lists of guests are filtered by token in SQL and sorted after decryption.

The trade-offs are deliberate. Blind indexes reveal equality: someone with database access can see that two rows share a token, but not what it is. Substring search inside a word (e.g. `anja` finding `Sanja`) is not supported.

**Keys** (generate each with `openssl rand -base64 32`):

- `DATA_ENCRYPTION_KEYS="1:<key>"` and `BLIND_INDEX_KEY=<key>`. Both are required in production; development and tests use built-in dev keys.
- **Back up both keys separately from the database.** Without them the data is unreadable.
- **Rotating the data key:** add a key (`1:<old>,2:<new>`), set `DATA_ENCRYPTION_KEY_ID=2`, and run `pnpm db:migrate`, which re-encrypts every row. Remove the old key only after that finishes.
- **Changing `BLIND_INDEX_KEY`:** the next `pnpm db:migrate` rebuilds all search indexes.
- `pnpm db:migrate` also encrypts any data still stored in plaintext. Upgrading an existing database is therefore one command.

## Fiscal receipts and analytics (Serbia)

When a table finishes, staff are offered **Scan receipt**. They can also do it
from the table popover or the reservation (including later, from history), or
from Analytics without a guest and link it afterwards. The camera reads the QR
code on the fiscal receipt; a photo or the pasted link works too.

- **Offline part:** the QR link (`https://suf.purs.gov.rs/v/?vl=…`) already
  contains the invoice number, total, time and sale/refund (`receipts/suf.ts`,
  `decodeVl`). This is saved immediately, even when the tax site is down.
- **Online part:** line items come from the public verification page and its
  `specifications` endpoint, with the printed receipt text (journal) as a
  fallback; payment methods come from the journal. Plain parsing, no AI.
  Failed fetches are retried every 10 minutes for 7 days.
- Copies, pro-forma and training receipts are refused; the same receipt can't
  be scanned twice; refunds are stored negative so totals are always net.
- A reservation's spend is the sum of its receipts. Guest profiles show what
  the guest orders and spends; **Analytics** (owner) shows revenue by day, hour
  and weekday, best sellers, best sellers per shift and payment methods.

Requirements: the API server must reach `https://suf.purs.gov.rs`, and the
camera needs HTTPS (or localhost). To check a real receipt against the live site:

```bash
pnpm --filter @hostly/api receipt:check "<link from the QR code>" [--save page.html]
```

`pnpm db:seed` adds a month of demo receipts (seller "DEMO") so Analytics has data.

## Languages

Serbian (default for staff) and English ship today. Everything language-specific
hangs off one registry, so adding a language (say German, `de`) is:

1. **`packages/shared/src/languages.ts`**: add `'de'` to `LANGUAGES` and an entry
   to `LANGUAGE_INFO` (native name for pickers, Intl/Luxon locale, long and short
   date formats, and the browser language codes it should match, e.g. `['de']`).
   TypeScript then points at every place that needs the new language.
2. **`apps/web/src/i18n/locales/de.ts`**: copy `en.ts`, translate, register it in
   `locales/index.ts`. A locale may be partial; missing texts show in English.
   `missingKeys(LOCALES.de)` lists what is still untranslated.
3. **`apps/api/src/messaging/templates/de.ts`**: guest emails; register it in
   `templates/index.ts`. Until then guests with that language get English emails.

No migration is needed: language columns are plain text validated by the API.
The booking widget picks the guest's browser language when it is supported
(`?lang=de` forces one); staff choose theirs from the globe button in the menu.

## Tests

```bash
pnpm test
```

- `packages/shared`: phone normalization, duration rules (vitest)
- `apps/api` unit: table suggestion rules, timezone/shift helpers, encryption and key rotation, blind-index search (jest)
- `apps/api` e2e (against `hostly_test`, wiped on every run): admin panel (session separation, metrics, create/suspend/share/reset, no guest data exposed), no plaintext personal data at rest and search over encrypted fields, tenant isolation and guest-book sharing (merge, unshare), auth and roles, creating reservations with customer linking and VIP ranking, double-booking prevention including a 6-way concurrent race, status flow and audit log, and the public widget end to end (availability, booking, held table, emails in the guest's language, guest cancel, full slot, honeypot)
- `apps/web`: floor-plan table state logic, chart axis scaling (vitest)

Set `TEST_DATABASE_URL` to use a different test database (default: the Docker one on port 5433). The URL must contain `test`.

## Environment variables

See `.env.example` for the full list. The important ones:

| Variable                    | Purpose                                                                  |
| --------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`              | Postgres connection string                                               |
| `JWT_SECRET`                | Long random string. Required in production (`openssl rand -hex 32`)      |
| `APP_URL`                   | Public URL, used in guest email links                                    |
| `CORS_ORIGIN`               | Allowed browser origins. In production, the same as `APP_URL`            |
| `COOKIE_SECURE`             | `true` behind HTTPS                                                      |
| `WEB_DIST`                  | Path of the built SPA for the API to serve (`apps/web/dist`)             |
| `SMTP_*`, `MAIL_FROM`       | SMTP. For Resend: host `smtp.resend.com`, user `resend`, pass = API key  |
| `REMINDERS_ENABLED`         | Day-before reminder emails (checked every 30 min)                        |
| `PUBLIC_RATE_LIMIT_PER_MIN` | Booking/cancel requests per IP per minute on the public widget           |

## Deploy (single server, pm2, Cloudflare)

```bash
# On the server (Ubuntu): Node 22, pnpm, PostgreSQL, pm2
sudo -u postgres createuser -P hostly && sudo -u postgres createdb -O hostly hostly
git clone <repo> hostly && cd hostly
pnpm install --frozen-lockfile
cp .env.example .env   # set NODE_ENV=production, JWT_SECRET, DATA_ENCRYPTION_KEYS, BLIND_INDEX_KEY, APP_URL, CORS_ORIGIN, COOKIE_SECURE=true, SMTP_*
pnpm build
node apps/api/dist/db/migrate.js
SEED_PASSWORD='<strong password>' pnpm db:seed   # first deploy only; change passwords afterwards
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

The app listens on `PORT` (3000) and serves the SPA, the API and the WebSocket from that one port.

**Cloudflare.** Point the DNS record at the server, or use a Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:3000`), so nothing has to be exposed publicly. Then:

- Set SSL mode to *Full (strict)* if you terminate TLS on the server, for example with nginx and an origin certificate.
- Make sure WebSockets are enabled (they are on by default).
- Set `COOKIE_SECURE=true`.

The API trusts the first proxy hop for client IPs, which the rate limits rely on.

If nginx is in front, forward the WebSocket upgrade:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**Updates:** `git pull && pnpm install && pnpm build && node apps/api/dist/db/migrate.js && pm2 restart hostly`

Run exactly one API instance. Socket.IO rooms are in memory, so scaling out would need the Redis adapter.

## Design notes

- **Multi-tenant.** Every row carries `restaurant_id` (customers carry `guest_book_id`), and every query is scoped to the signed-in user's restaurant or its guest book. Sessions are re-checked on every request, so deleting a user or changing their role takes effect immediately. Self-service signup and billing are not built: restaurants are created with `pnpm tenant create`.
- **One availability source.** `AvailabilityService.getFreeTables()` feeds the table suggestion, form validation, the manual table picker and the public widget.
- **No double booking.** `reservation_tables` mirrors each reservation's time window as a `tstzrange`. A Postgres `EXCLUDE USING gist (table_id WITH =, during WITH &&) WHERE (active)` constraint rejects overlaps, even under concurrent requests, and the API turns them into `409 table_conflict`.
- **Table suggestion.** First choice is a single table where `min ≤ covers ≤ max`, picking the smallest `max_seats`. Ties go to the higher rating for VIP/SVIP guests and the lower rating otherwise. If no single table fits, it tries predefined join groups, then ad hoc joins of adjacent free tables in the same area. The online widget only offers single tables and predefined groups.
- **Guest language.** Messages use the language stored on the reservation (from the widget, the form or the customer). The staff UI language is never used for guest messages.
- **Messaging channels.** `ChannelAdapter` (`apps/api/src/messaging/channel.ts`) is the extension point for SMS, Viber or WhatsApp.
- **Business day.** The day runs from `day_start` (default 06:00) to 05:59, so after-midnight dinner bookings stay on the right day.
- **Pending online requests** hold the suggested table, so concurrent web bookings can't oversell. The host can change the table when accepting.

### Additions beyond the spec's data model

These are small additions the screens needed:

- `restaurant.slug`, `day_start`, `online_settings` (JSON), contact fields
- `reservation.first_name`/`last_name` instead of a single `guest_name` (the form has both), plus `area_id`, `extras` (cake, smoking area, discount), `spend`, `decline_reason`, `guest_token`, `seated_at`, `completed_at`, `reminder_sent_at`
- `customer.average_spend` (manual in the MVP)
- `waiting_entry.notes`, and `message.recipient`/`error`
- A `waiting.suggest` WebSocket event, sent when a freed table fits someone on the waiting list
