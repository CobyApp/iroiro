#!/usr/bin/env bash
# Delete every iroiro resource in one region (plus the global IAM roles/users when --iam is given).
#   AWS_DEFAULT_REGION=ap-northeast-1 ./infra/aws/teardown.sh --yes [--iam]
# Fire-and-forget for slow deletions (RDS, ECS); re-run to clean leftovers.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-personal}"
REGION="${AWS_DEFAULT_REGION:?set AWS_DEFAULT_REGION to the region to tear down}"
APP="iroiro"; ENVS="${ENVS:-dev prd}"
[ "${1:-}" = "--yes" ] || { echo "refusing without --yes (region: $REGION)"; exit 1; }
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
say(){ printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }; ok(){ printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }

say "ECS Express services / cluster ($REGION)"
for e in $ENVS; do
  arn=$(aws ecs list-services --cluster "$APP" --query "serviceArns[?ends_with(@, '/${APP}-$e')] | [0]" --output text 2>/dev/null || echo None)
  [ "$arn" != "None" ] && [ -n "$arn" ] && { aws ecs delete-express-gateway-service --service-arn "$arn" >/dev/null && ok "deleting $arn"; }
done
if aws ecs describe-clusters --clusters "$APP" --query 'clusters[0].status' --output text 2>/dev/null | grep -q ACTIVE; then
  for i in $(seq 1 40); do n=$(aws ecs list-services --cluster "$APP" --query 'length(serviceArns)' --output text); [ "$n" = 0 ] && break; sleep 15; done
  aws ecs delete-cluster --cluster "$APP" >/dev/null && ok "cluster deleted"
fi
for e in $ENVS; do aws logs delete-log-group --log-group-name "/ecs/${APP}-${e}" 2>/dev/null && ok "log group /ecs/${APP}-${e}"; done

say "EventBridge cron"
for e in $ENVS; do
  r="${APP}-close-auctions-${e}"
  aws events remove-targets --rule "$r" --ids api >/dev/null 2>&1 || true
  aws events delete-rule --name "$r" >/dev/null 2>&1 && ok "rule $r" || true
  aws events delete-api-destination --name "$r" >/dev/null 2>&1 || true
  aws events delete-connection --name "${APP}-cron-${e}" >/dev/null 2>&1 || true
done

say "RDS"
for e in $ENVS; do
  id="${APP}-${e}"
  if aws rds describe-db-instances --db-instance-identifier "$id" >/dev/null 2>&1; then
    aws rds modify-db-instance --db-instance-identifier "$id" --no-deletion-protection --apply-immediately >/dev/null 2>&1 || true
    aws rds delete-db-instance --db-instance-identifier "$id" --skip-final-snapshot --delete-automated-backups >/dev/null && ok "deleting $id (background)"
  fi
done

say "S3"
for e in $ENVS; do for b in "${APP}-kr-products-${e}" "${APP}-kr-ugc-${e}" "${APP}-products-${e}" "${APP}-ugc-${e}"; do
  aws s3api head-bucket --bucket "$b" 2>/dev/null || continue
  # Bucket names are global — only touch buckets that actually live in this region.
  loc=$(aws s3api get-bucket-location --bucket "$b" --query LocationConstraint --output text); [ "$loc" = "None" ] && loc=us-east-1
  [ "$loc" = "$REGION" ] || { echo "  - skip $b (in $loc)"; continue; }
  aws s3 rm "s3://$b" --recursive --only-show-errors; aws s3api delete-bucket --bucket "$b" && ok "bucket $b"
done; done

say "ECR"
aws ecr delete-repository --repository-name "$APP" --force >/dev/null 2>&1 && ok "repository $APP" || true

say "SSM parameters"
names=$(aws ssm get-parameters-by-path --path "/${APP}" --recursive --query 'Parameters[].Name' --output text)
[ -n "$names" ] && echo "$names" | tr '\t' '\n' | xargs -n 10 aws ssm delete-parameters --names >/dev/null && ok "$(echo "$names" | wc -w | tr -d ' ') parameters"

say "ACM ($REGION)"
for arn in $(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='iroiro.club'].CertificateArn" --output text); do
  aws acm delete-certificate --certificate-arn "$arn" 2>/dev/null && ok "cert $arn" || echo "  ! cert $arn still in use — rerun after the ALB is gone"
done

say "Security groups (after RDS is gone)"
for e in $ENVS; do
  sg=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${APP}-db-${e}" --query 'SecurityGroups[0].GroupId' --output text)
  [ "$sg" != "None" ] && { aws ec2 delete-security-group --group-id "$sg" 2>/dev/null && ok "sg $sg" || echo "  ! $sg still attached (RDS deleting) — rerun later"; }
done

if [ "${2:-}" = "--iam" ]; then
  say "IAM (global)"
  for e in $ENVS; do
    u="${APP}-app-${e}"
    if aws iam get-user --user-name "$u" >/dev/null 2>&1; then
      for k in $(aws iam list-access-keys --user-name "$u" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do aws iam delete-access-key --user-name "$u" --access-key-id "$k"; done
      for p in $(aws iam list-user-policies --user-name "$u" --query 'PolicyNames' --output text); do aws iam delete-user-policy --user-name "$u" --policy-name "$p"; done
      aws iam delete-user --user-name "$u" && ok "user $u"
    fi
  done
  for r in $(aws iam list-roles --query "Roles[?starts_with(RoleName,'${APP}-')].RoleName" --output text); do
    for p in $(aws iam list-attached-role-policies --role-name "$r" --query 'AttachedPolicies[].PolicyArn' --output text); do aws iam detach-role-policy --role-name "$r" --policy-arn "$p"; done
    for p in $(aws iam list-role-policies --role-name "$r" --query 'PolicyNames' --output text); do aws iam delete-role-policy --role-name "$r" --policy-name "$p"; done
    aws iam delete-role --role-name "$r" && ok "role $r"
  done
fi
echo; echo "done — rerun later to remove leftovers that were still deleting (RDS security groups, ACM cert in use)."
