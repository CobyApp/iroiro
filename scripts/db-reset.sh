#!/bin/sh
# Local DB reset: wipe public schema, re-apply schema, grant app roles LOGIN.
#   commerce  iroiro          ← db/schema.sql          (app / app)
#   catalog   iroiro_catalog  ← db/catalog-schema.sql  (catalog_app / catalog)
# Requires the compose.yaml postgres service to be running (npm run services:up).
set -eu
cd "$(dirname "$0")/.."
PSQL="docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -q"

$PSQL -d iroiro -f - < scripts/db-reset.sql
$PSQL -d iroiro -f - < db/schema.sql
$PSQL -d iroiro -c "ALTER ROLE app WITH LOGIN PASSWORD 'app';"
echo "commerce db reset done → postgresql://app:app@127.0.0.1:5432/iroiro"

# 카탈로그 DB — 볼륨이 initdb 이전에 만들어졌으면 DB 가 없을 수 있어 여기서도 보장한다.
$PSQL -d postgres -tAc "select 1 from pg_database where datname='iroiro_catalog'" | grep -q 1 \
  || $PSQL -d postgres -c "CREATE DATABASE iroiro_catalog;"
$PSQL -d iroiro_catalog -f - < scripts/db-reset.sql
$PSQL -d iroiro_catalog -f - < db/catalog-schema.sql
$PSQL -d iroiro_catalog -c "ALTER ROLE catalog_app WITH LOGIN PASSWORD 'app';"
echo "catalog db reset done → postgresql://catalog_app:app@127.0.0.1:5432/iroiro_catalog"
