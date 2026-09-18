#!/usr/bin/env bash
# Apply db/schema.sql to an RDS environment and grant the app role LOGIN.
#   ./infra/aws/db-apply.sh dev|prd [--reset]
# --reset wipes the public schema first (scripts/db-reset.sql). Never use on prd with data.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-personal}" AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
ENV_NAME="${1:?usage: db-apply.sh dev|prd [--reset]}"
cd "$(dirname "$0")/../.."
command -v psql >/dev/null || { echo "psql required (brew install libpq)"; exit 1; }
ssm() { aws ssm get-parameter --name "/iroiro/${ENV_NAME}/$1" --with-decryption --query Parameter.Value --output text; }
# RDS security group only admits the VPC and explicitly allowed operator IPs — add the current one.
MY_IP="$(curl -s https://checkip.amazonaws.com)/32"
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=iroiro-db-${ENV_NAME}" --query 'SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$MY_IP,Description=operator}]" >/dev/null 2>&1 || true
OWNER_URL=$(ssm DATABASE_URL_OWNER)
APP_URL=$(ssm DATABASE_URL)
APP_PW=$(python3 -c "import sys,urllib.parse as u; print(u.unquote(u.urlsplit(sys.argv[1]).password))" "$APP_URL")
if [ "${2:-}" = "--reset" ]; then
  [ "$ENV_NAME" = prd ] && { read -rp "This wipes PRODUCTION data. Type 'wipe prd' to continue: " a; [ "$a" = "wipe prd" ] || exit 1; }
  psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f scripts/db-reset.sql
fi
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -f db/schema.sql
psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q -c "ALTER ROLE app WITH LOGIN PASSWORD '${APP_PW}';"
psql "${APP_URL%%\?*}?sslmode=require" -tAc "select 'app role ok — tables: ' || count(*) from pg_tables where schemaname='public'"
