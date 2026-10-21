#!/bin/sh
# Migrate, seed the demo restaurant on first start (skipped when it exists), then run the API.
set -e
node dist/db/migrate.js
if [ "${SEED_ON_START:-true}" = "true" ]; then
  node dist/db/seed.js
fi
exec node dist/main.js
