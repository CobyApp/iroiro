#!/bin/sh
# Local DB reset: wipe public schema, re-apply db/schema.sql, grant app role LOGIN.
# Requires the compose.yml postgres service to be running (npm run services:up).
set -eu
cd "$(dirname "$0")/.."
PSQL="docker compose exec -T postgres psql -U postgres -d iroiro -v ON_ERROR_STOP=1 -q"
$PSQL -f - < scripts/db-reset.sql
$PSQL -f - < db/schema.sql
$PSQL -c "ALTER ROLE app WITH LOGIN PASSWORD 'app';"
echo "db reset done → postgresql://app:app@127.0.0.1:5432/iroiro"
