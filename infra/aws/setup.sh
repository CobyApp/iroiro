#!/usr/bin/env bash
#
# iroiro — AWS provisioning (idempotent). Region: Tokyo (App Runner is not offered in Seoul).
#
#   ./infra/aws/setup.sh core       ECR · S3 · app IAM user · SSM placeholders · GitHub OIDC role
#   ./infra/aws/setup.sh db         RDS PostgreSQL 17 ×2 (iroiro-dev / iroiro-prd) + connection URLs → SSM
#   ./infra/aws/setup.sh github     GitHub environment variables (dev / production) for deploy.yml
#   ./infra/aws/setup.sh apprunner  App Runner services (requires an image pushed by CI first)
#   ./infra/aws/setup.sh domains    Custom domains → prints DNS records to add at Squarespace
#   ./infra/aws/setup.sh cron       EventBridge → /api/cron/close-auctions every 10 min (needs CRON_SECRET set)
#   ./infra/aws/setup.sh status     Summary of everything above
#
# Env overrides: AWS_PROFILE (default personal), ENVS (default "dev prd").
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-personal}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"
REGION="$AWS_DEFAULT_REGION"
APP="iroiro"
GH_REPO="CobyApp/iroiro"
DOMAIN="iroiro.club"
ENVS="${ENVS:-dev prd}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

domain_for()  { [ "$1" = prd ] && echo "$DOMAIN" || echo "dev.$DOMAIN"; }
gh_env_for()  { [ "$1" = prd ] && echo "production" || echo "dev"; }
branch_for()  { [ "$1" = prd ] && echo "main" || echo "dev"; }
ssm_arn()     { echo "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/${APP}/$1/$2"; }
rand()        { openssl rand -base64 36 | tr -d '/+=' | cut -c1-32; }

ssm_put_if_missing() { # name value [type]
  if aws ssm get-parameter --name "$1" >/dev/null 2>&1; then ok "SSM exists: $1"; else
    aws ssm put-parameter --name "$1" --value "$2" --type "${3:-SecureString}" --tags "Key=app,Value=$APP" >/dev/null
    ok "SSM created: $1"; fi
}
ssm_get() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text; }

# ───────────────────────────── core ─────────────────────────────
phase_core() {
  say "ECR repository"
  aws ecr describe-repositories --repository-names "$APP" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$APP" --image-scanning-configuration scanOnPush=true \
         --image-tag-mutability MUTABLE --tags "Key=app,Value=$APP" >/dev/null
  aws ecr put-lifecycle-policy --repository-name "$APP" --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep last 30 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},"action":{"type":"expire"}}]}' >/dev/null
  ok "ecr: ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${APP}"

  for e in $ENVS; do
    say "S3 buckets ($e)"
    local pub="${APP}-products-${e}" ugc="${APP}-ugc-${e}"
    for b in "$pub" "$ugc"; do
      aws s3api head-bucket --bucket "$b" 2>/dev/null || aws s3api create-bucket --bucket "$b" \
        --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
      aws s3api put-bucket-tagging --bucket "$b" --tagging "TagSet=[{Key=app,Value=$APP},{Key=env,Value=$e}]"
      aws s3api put-bucket-encryption --bucket "$b" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
    done
    # products: public read (catalog images are served by URL)
    aws s3api put-public-access-block --bucket "$pub" --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false"
    aws s3api put-bucket-policy --bucket "$pub" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"PublicRead\",\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::${pub}/*\"}]}"
    # ugc: private, signed GET only; tmp uploads expire after a day
    aws s3api put-public-access-block --bucket "$ugc" --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    aws s3api put-bucket-lifecycle-configuration --bucket "$ugc" --lifecycle-configuration \
      '{"Rules":[{"ID":"expire-tmp","Status":"Enabled","Filter":{"Prefix":"posts/tmp/"},"Expiration":{"Days":1}}]}'
    ok "$pub (public read), $ugc (private)"

    say "App IAM user for S3 ($e)"
    local user="${APP}-app-${e}"
    aws iam get-user --user-name "$user" >/dev/null 2>&1 || aws iam create-user --user-name "$user" --tags "Key=app,Value=$APP" >/dev/null
    aws iam put-user-policy --user-name "$user" --policy-name s3-buckets --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\"],\"Resource\":[\"arn:aws:s3:::${pub}\",\"arn:aws:s3:::${pub}/*\",\"arn:aws:s3:::${ugc}\",\"arn:aws:s3:::${ugc}/*\"]}]}"
    if ! aws ssm get-parameter --name "/${APP}/${e}/R2_ACCESS_KEY_ID" >/dev/null 2>&1; then
      local key; key=$(aws iam create-access-key --user-name "$user" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
      ssm_put_if_missing "/${APP}/${e}/R2_ACCESS_KEY_ID"     "$(echo "$key" | cut -f1)"
      ssm_put_if_missing "/${APP}/${e}/R2_SECRET_ACCESS_KEY" "$(echo "$key" | cut -f2)"
    else ok "access key already stored in SSM"; fi

    say "SSM placeholders for app secrets ($e) — fill with: aws ssm put-parameter --overwrite --type SecureString --name /${APP}/${e}/<NAME> --value '...'"
    for s in KAKAO_REST_API_KEY KAKAO_CLIENT_SECRET NAVER_CLIENT_ID NAVER_CLIENT_SECRET CUTIE_CARD_API_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
      ssm_put_if_missing "/${APP}/${e}/${s}" "CHANGE_ME"
    done
    ssm_put_if_missing "/${APP}/${e}/CRON_SECRET" "$(rand)"
  done

  say "GitHub Actions OIDC provider + deploy role"
  local oidc_arn="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"
  aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$oidc_arn" >/dev/null 2>&1 \
    || aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com \
         --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 1c58a3a8518e8759bf075b76b750d4f2df264fcd >/dev/null
  local role="${APP}-github-deploy"
  local trust; trust=$(cat <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"${oidc_arn}"},"Action":"sts:AssumeRoleWithWebIdentity",
 "Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},
  "StringLike":{"token.actions.githubusercontent.com:sub":["repo:${GH_REPO}:ref:refs/heads/dev","repo:${GH_REPO}:ref:refs/heads/main","repo:${GH_REPO}:environment:dev","repo:${GH_REPO}:environment:production"]}}}]}
JSON
)
  if aws iam get-role --role-name "$role" >/dev/null 2>&1; then aws iam update-assume-role-policy --role-name "$role" --policy-document "$trust"; else
    aws iam create-role --role-name "$role" --assume-role-policy-document "$trust" --tags "Key=app,Value=$APP" >/dev/null; fi
  aws iam put-role-policy --role-name "$role" --policy-name deploy --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:CompleteLayerUpload\",\"ecr:InitiateLayerUpload\",\"ecr:PutImage\",\"ecr:UploadLayerPart\",\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],\"Resource\":\"arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${APP}\"},
    {\"Effect\":\"Allow\",\"Action\":[\"apprunner:StartDeployment\",\"apprunner:ListOperations\",\"apprunner:DescribeService\"],\"Resource\":\"arn:aws:apprunner:${REGION}:${ACCOUNT_ID}:service/${APP}-*\"}]}"
  ok "role: arn:aws:iam::${ACCOUNT_ID}:role/${role}"
}

# ───────────────────────────── db ─────────────────────────────
phase_db() {
  local vpc; vpc=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
  [ "$vpc" != "None" ] || die "default VPC not found in $REGION — create one (aws ec2 create-default-vpc) and rerun"
  local ver; ver=$(aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[?starts_with(EngineVersion,'17.')].EngineVersion | [-1]" --output text)
  for e in $ENVS; do
    say "RDS PostgreSQL $ver ($e)"
    local sg_name="${APP}-db-${e}" id="${APP}-${e}"
    local sg; sg=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$sg_name" "Name=vpc-id,Values=$vpc" --query 'SecurityGroups[0].GroupId' --output text)
    if [ "$sg" = "None" ]; then
      sg=$(aws ec2 create-security-group --group-name "$sg_name" --description "iroiro $e postgres" --vpc-id "$vpc" --query GroupId --output text)
      # App Runner egress IPs are not fixed → open 5432; defence = strong password + TLS + app-role GRANTs.
      aws ec2 authorize-security-group-ingress --group-id "$sg" --protocol tcp --port 5432 --cidr 0.0.0.0/0 >/dev/null
    fi
    ok "security group $sg"
    if ! aws rds describe-db-instances --db-instance-identifier "$id" >/dev/null 2>&1; then
      local master_pw; master_pw=$(rand)
      local extra=(--backup-retention-period 1 --no-deletion-protection)
      [ "$e" = prd ] && extra=(--backup-retention-period 7 --deletion-protection)
      aws rds create-db-instance --db-instance-identifier "$id" --engine postgres --engine-version "$ver" \
        --db-instance-class db.t4g.micro --allocated-storage 20 --storage-type gp3 --storage-encrypted \
        --db-name iroiro --master-username iroiro_admin --master-user-password "$master_pw" \
        --vpc-security-group-ids "$sg" --publicly-accessible --no-multi-az --auto-minor-version-upgrade \
        --preferred-backup-window 18:00-19:00 --preferred-maintenance-window sun:19:00-sun:20:00 \
        --tags "Key=app,Value=$APP" "Key=env,Value=$e" "${extra[@]}" >/dev/null
      ssm_put_if_missing "/${APP}/${e}/DB_MASTER_PASSWORD" "$master_pw"
      ok "creating $id (takes ~5–10 min)"
    else ok "$id exists"; fi
  done
  for e in $ENVS; do
    local id="${APP}-${e}"
    say "waiting for $id to become available"
    aws rds wait db-instance-available --db-instance-identifier "$id"
    local host; host=$(aws rds describe-db-instances --db-instance-identifier "$id" --query 'DBInstances[0].Endpoint.Address' --output text)
    local master_pw; master_pw=$(ssm_get "/${APP}/${e}/DB_MASTER_PASSWORD")
    ssm_put_if_missing "/${APP}/${e}/DATABASE_URL_OWNER" "postgresql://iroiro_admin:${master_pw}@${host}:5432/iroiro?sslmode=require"
    ssm_put_if_missing "/${APP}/${e}/DATABASE_URL"       "postgresql://app:$(rand)@${host}:5432/iroiro?sslmode=require"
    ok "$id → $host"
  done
  warn "next: ./infra/aws/db-apply.sh <env>  (applies db/schema.sql and grants the app role LOGIN)"
}

# ───────────────────────────── github ─────────────────────────────
phase_github() {
  command -v gh >/dev/null || die "gh CLI required"
  local role="arn:aws:iam::${ACCOUNT_ID}:role/${APP}-github-deploy"
  for e in $ENVS; do
    local ghe; ghe=$(gh_env_for "$e")
    say "GitHub environment '$ghe'"
    gh api -X PUT "repos/${GH_REPO}/environments/${ghe}" >/dev/null
    gh variable set AWS_ROLE_ARN   --env "$ghe" --body "$role" -R "$GH_REPO"
    gh variable set ECR_REPOSITORY --env "$ghe" --body "$APP"  -R "$GH_REPO"
    local svc; svc=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${APP}-${e}'].ServiceArn | [0]" --output text 2>/dev/null || echo None)
    if [ "$svc" != "None" ] && [ -n "$svc" ]; then gh variable set APPRUNNER_SERVICE_ARN --env "$ghe" --body "$svc" -R "$GH_REPO"; ok "APPRUNNER_SERVICE_ARN set"; else warn "App Runner service not created yet — rerun 'github' after 'apprunner'"; fi
    if [ -n "${IMAGE_ONLY:-}" ]; then gh variable set APPRUNNER_SERVICE_ARN --env "$ghe" --body "pending" -R "$GH_REPO"; fi
    ok "AWS_ROLE_ARN, ECR_REPOSITORY set"
  done
  # Repo-level gate read by deploy.yml's job-level `if`. IMAGE_ONLY=1 enables the workflow before the
  # services exist so CI can push the first image (the App Runner step then fails, which is expected).
  local all_ready=true; for e in $ENVS; do aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${APP}-${e}'].ServiceArn | [0]" --output text 2>/dev/null | grep -qv '^None$' || all_ready=false; done
  if [ "$all_ready" = true ] || [ -n "${IMAGE_ONLY:-}" ]; then gh variable set DEPLOY_ENABLED --body true -R "$GH_REPO"; ok "DEPLOY_ENABLED=true"; else warn "DEPLOY_ENABLED left unset — run with IMAGE_ONLY=1 to build the first image"; fi
}

# ───────────────────────────── apprunner ─────────────────────────────
phase_apprunner() {
  say "App Runner roles"
  local ecr_role="${APP}-apprunner-ecr-access"
  aws iam get-role --role-name "$ecr_role" >/dev/null 2>&1 || aws iam create-role --role-name "$ecr_role" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ecr_role" --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
  local asc; asc=$(aws apprunner list-auto-scaling-configurations --auto-scaling-configuration-name "${APP}-small" --latest-only \
    --query 'AutoScalingConfigurationSummaryList[0].AutoScalingConfigurationArn' --output text)
  if [ "$asc" = "None" ] || [ -z "$asc" ]; then
    asc=$(aws apprunner create-auto-scaling-configuration --auto-scaling-configuration-name "${APP}-small" \
      --min-size 1 --max-size 3 --max-concurrency 100 --query 'AutoScalingConfiguration.AutoScalingConfigurationArn' --output text)
  fi
  ok "auto scaling: $asc"

  for e in $ENVS; do
    say "App Runner service ${APP}-${e}"
    local inst_role="${APP}-apprunner-instance-${e}"
    aws iam get-role --role-name "$inst_role" >/dev/null 2>&1 || aws iam create-role --role-name "$inst_role" \
      --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"tasks.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
    aws iam put-role-policy --role-name "$inst_role" --policy-name ssm-secrets --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"ssm:GetParameters\",\"ssm:GetParameter\"],\"Resource\":\"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/${APP}/${e}/*\"},{\"Effect\":\"Allow\",\"Action\":\"kms:Decrypt\",\"Resource\":\"*\",\"Condition\":{\"StringEquals\":{\"kms:ViaService\":\"ssm.${REGION}.amazonaws.com\"}}}]}"
    sleep 5 # IAM propagation
    local image="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${APP}:${e}-latest"
    aws ecr describe-images --repository-name "$APP" --image-ids "imageTag=${e}-latest" >/dev/null 2>&1 \
      || die "image ${image} not found — push the '$(branch_for "$e")' branch so CI builds it, then rerun"
    local dom; dom=$(domain_for "$e")
    local secrets="{"; for s in DATABASE_URL R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY KAKAO_REST_API_KEY KAKAO_CLIENT_SECRET NAVER_CLIENT_ID NAVER_CLIENT_SECRET CUTIE_CARD_API_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT CRON_SECRET; do
      secrets+="\"$s\":\"$(ssm_arn "$e" "$s")\","; done; secrets="${secrets%,}}"
    local envs="{\"APP_URL\":\"https://${dom}\",\"R2_ENDPOINT\":\"https://s3.${REGION}.amazonaws.com\",\"R2_REGION\":\"${REGION}\",\"R2_BUCKET\":\"${APP}-products-${e}\",\"R2_PUBLIC_BASE\":\"https://${APP}-products-${e}.s3.${REGION}.amazonaws.com\",\"R2_UGC_BUCKET\":\"${APP}-ugc-${e}\",\"PAYMENT_PROVIDER\":\"mock\",\"NEXT_TELEMETRY_DISABLED\":\"1\"}"
    local src="{\"AuthenticationConfiguration\":{\"AccessRoleArn\":\"arn:aws:iam::${ACCOUNT_ID}:role/${ecr_role}\"},\"AutoDeploymentsEnabled\":false,\"ImageRepository\":{\"ImageIdentifier\":\"${image}\",\"ImageRepositoryType\":\"ECR\",\"ImageConfiguration\":{\"Port\":\"3000\",\"RuntimeEnvironmentVariables\":${envs},\"RuntimeEnvironmentSecrets\":${secrets}}}}"
    local inst="{\"Cpu\":\"1 vCPU\",\"Memory\":\"2 GB\",\"InstanceRoleArn\":\"arn:aws:iam::${ACCOUNT_ID}:role/${inst_role}\"}"
    local svc; svc=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${APP}-${e}'].ServiceArn | [0]" --output text)
    if [ "$svc" = "None" ] || [ -z "$svc" ]; then
      svc=$(aws apprunner create-service --service-name "${APP}-${e}" --source-configuration "$src" --instance-configuration "$inst" \
        --auto-scaling-configuration-arn "$asc" --health-check-configuration '{"Protocol":"TCP","Interval":10,"Timeout":5,"HealthyThreshold":1,"UnhealthyThreshold":5}' \
        --tags "Key=app,Value=$APP" "Key=env,Value=$e" --query 'Service.ServiceArn' --output text)
      ok "creating $svc"
    else
      aws apprunner update-service --service-arn "$svc" --source-configuration "$src" --instance-configuration "$inst" >/dev/null
      ok "updated $svc"
    fi
  done
  for e in $ENVS; do
    local svc; svc=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${APP}-${e}'].ServiceArn | [0]" --output text)
    say "waiting for ${APP}-${e}"
    for i in $(seq 1 60); do
      local st; st=$(aws apprunner describe-service --service-arn "$svc" --query 'Service.Status' --output text)
      [ "$st" = RUNNING ] && break; [ "$st" = CREATE_FAILED ] && die "service create failed — check App Runner logs"; sleep 15
    done
    ok "https://$(aws apprunner describe-service --service-arn "$svc" --query 'Service.ServiceUrl' --output text)"
  done
}

# ───────────────────────────── domains ─────────────────────────────
phase_domains() {
  for e in $ENVS; do
    local svc; svc=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='${APP}-${e}'].ServiceArn | [0]" --output text)
    [ "$svc" != "None" ] || die "service ${APP}-${e} missing — run 'apprunner' first"
    local dom; dom=$(domain_for "$e")
    say "custom domain $dom → ${APP}-${e}"
    if ! aws apprunner describe-custom-domains --service-arn "$svc" --query "CustomDomains[?DomainName=='$dom']" --output text | grep -q .; then
      if [ "$e" = prd ]; then aws apprunner associate-custom-domain --service-arn "$svc" --domain-name "$dom" --enable-www-subdomain >/dev/null
      else aws apprunner associate-custom-domain --service-arn "$svc" --domain-name "$dom" --no-enable-www-subdomain >/dev/null; fi
    fi
    local target; target=$(aws apprunner describe-custom-domains --service-arn "$svc" --query DNSTarget --output text)
    echo "  Squarespace DNS records:"
    if [ "$e" = prd ]; then printf '    ALIAS  @    %s\n    CNAME  www  %s\n' "$target" "$target"; else printf '    CNAME  dev  %s\n' "$target"; fi
    aws apprunner describe-custom-domains --service-arn "$svc" \
      --query "CustomDomains[?DomainName=='$dom'].CertificateValidationRecords[].[Name,Value]" --output text | sed 's/^/    CNAME  /'
    aws apprunner describe-custom-domains --service-arn "$svc" --query "CustomDomains[?DomainName=='$dom'].Status" --output text | sed 's/^/  status: /'
  done
}

# ───────────────────────────── cron ─────────────────────────────
phase_cron() {
  local role="${APP}-events-apidest"
  aws iam get-role --role-name "$role" >/dev/null 2>&1 || aws iam create-role --role-name "$role" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam put-role-policy --role-name "$role" --policy-name invoke --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"events:InvokeApiDestination\",\"Resource\":\"arn:aws:events:${REGION}:${ACCOUNT_ID}:api-destination/${APP}-*\"}]}"
  for e in $ENVS; do
    say "EventBridge cron ($e) — close-auctions every 10 min"
    local secret; secret=$(ssm_get "/${APP}/${e}/CRON_SECRET")
    [ "$secret" != CHANGE_ME ] || die "CRON_SECRET for $e is still CHANGE_ME"
    local conn="${APP}-cron-${e}" dest="${APP}-close-auctions-${e}" dom; dom=$(domain_for "$e")
    local conn_arn; conn_arn=$(aws events describe-connection --name "$conn" --query ConnectionArn --output text 2>/dev/null || true)
    local auth="{\"ApiKeyAuthParameters\":{\"ApiKeyName\":\"Authorization\",\"ApiKeyValue\":\"Bearer ${secret}\"}}"
    if [ -z "$conn_arn" ]; then conn_arn=$(aws events create-connection --name "$conn" --authorization-type API_KEY --auth-parameters "$auth" --query ConnectionArn --output text)
    else aws events update-connection --name "$conn" --authorization-type API_KEY --auth-parameters "$auth" >/dev/null; fi
    local dest_arn; dest_arn=$(aws events describe-api-destination --name "$dest" --query ApiDestinationArn --output text 2>/dev/null || true)
    if [ -z "$dest_arn" ]; then dest_arn=$(aws events create-api-destination --name "$dest" --connection-arn "$conn_arn" \
        --invocation-endpoint "https://${dom}/api/cron/close-auctions" --http-method GET --invocation-rate-limit-per-second 1 --query ApiDestinationArn --output text)
    else aws events update-api-destination --name "$dest" --connection-arn "$conn_arn" --invocation-endpoint "https://${dom}/api/cron/close-auctions" --http-method GET >/dev/null; fi
    aws events put-rule --name "$dest" --schedule-expression "rate(10 minutes)" --state ENABLED >/dev/null
    aws events put-targets --rule "$dest" --targets "Id=api,Arn=${dest_arn},RoleArn=arn:aws:iam::${ACCOUNT_ID}:role/${role}" >/dev/null
    ok "$dest → https://${dom}/api/cron/close-auctions"
  done
}

# ───────────────────────────── status ─────────────────────────────
phase_status() {
  say "account $ACCOUNT_ID / $REGION"
  aws ecr describe-repositories --repository-names "$APP" --query 'repositories[0].repositoryUri' --output text 2>/dev/null | sed 's/^/  ecr: /' || true
  aws s3api list-buckets --query "Buckets[?starts_with(Name,'${APP}-')].Name" --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  s3: /'
  aws rds describe-db-instances --query "DBInstances[?starts_with(DBInstanceIdentifier,'${APP}-')].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]" --output text 2>/dev/null | sed 's/^/  rds: /' || true
  aws apprunner list-services --query "ServiceSummaryList[?starts_with(ServiceName,'${APP}-')].[ServiceName,Status,ServiceUrl]" --output text 2>/dev/null | sed 's/^/  apprunner: /' || true
  for e in $ENVS; do
    aws ssm get-parameters-by-path --path "/${APP}/${e}" --with-decryption --query "Parameters[?Value=='CHANGE_ME'].Name" --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  TODO secret: /'
  done
}

case "${1:-}" in
  core) phase_core ;; db) phase_db ;; github) phase_github ;; apprunner) phase_apprunner ;; domains) phase_domains ;; cron) phase_cron ;; status) phase_status ;;
  all) phase_core; phase_db; phase_github ;;
  *) sed -n 2,14p "$0"; exit 1 ;;
esac
