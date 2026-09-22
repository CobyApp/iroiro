#!/bin/sh
# Local DB reset: wipe public schema, re-apply schema, grant app role LOGIN.
#   commerce  iroiro  ← db/schema.sql  (app / app)
# 토레카 마스터(team·member·series·card…)는 커머스 DB(iroiro)로 병합됐다(2026-09-23) —
# 별도 카탈로그 DB(iroiro_catalog) 는 폐기.
# Requires the compose.yaml postgres service to be running (npm run services:up).
set -eu
cd "$(dirname "$0")/.."
PSQL="docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -q"

$PSQL -d iroiro -f - < scripts/db-reset.sql
$PSQL -d iroiro -f - < db/schema.sql
$PSQL -d iroiro -c "ALTER ROLE app WITH LOGIN PASSWORD 'app';"
echo "commerce db reset done → postgresql://app:app@127.0.0.1:5432/iroiro"
