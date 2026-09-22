#!/usr/bin/env bash
#
# iroiro — AWS provisioning (idempotent). Region: Seoul (ap-northeast-2). Compute: Amazon ECS Express Mode
# (App Runner stopped accepting new customers on 2026-04-30).
#
#   ./infra/aws/setup.sh core      ECR · S3 · app IAM user · SSM placeholders · GitHub OIDC role
#   ./infra/aws/setup.sh db        RDS PostgreSQL 17 ×2 (iroiro-dev / iroiro-prd) + connection URLs → SSM
#   ./infra/aws/setup.sh ecs       ECS cluster + Express services (shared ALB). Requires images in ECR.
#   ./infra/aws/setup.sh github    GitHub environment variables for deploy.yml (+ DEPLOY_ENABLED gate)
#   ./infra/aws/setup.sh domains   ACM cert (Tokyo) + ALB host rules → prints DNS records for Squarespace
#   ./infra/aws/setup.sh cron      EventBridge → /api/cron/close-auctions every 10 min
#   ./infra/aws/setup.sh catalog   카드 이미지는 products 버킷 cards/(wm public, clean private)로 통합.
#                                  products 버킷 공개 정책 + 앱 IAM 만 보장. 별도 카탈로그 버킷 없음.
#                                  Then run `ecs` (pushes CATALOG_BUCKET=products) and `domains`.
#   ./infra/aws/setup.sh migrate   Fargate task definitions iroiro-migrate-<env> (scripts/db-migrate.mjs)
#                                  + deploy-role permissions so deploy.yml can run them.
#   ./infra/aws/setup.sh status    Summary
#
# Env overrides: AWS_PROFILE (default personal), ENVS (default "dev prd"), IMAGE_ONLY=1 (github phase).
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-personal}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"
REGION="$AWS_DEFAULT_REGION"
APP="iroiro"
GH_REPO="CobyApp/iroiro"
DOMAIN="iroiro.club"
ENVS="${ENVS:-dev prd}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${APP}"

say()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

domain_for()  { [ "$1" = prd ] && echo "$DOMAIN" || echo "dev.$DOMAIN"; }
hosts_for()   { [ "$1" = prd ] && echo "$DOMAIN www.$DOMAIN" || echo "dev.$DOMAIN"; }
gh_env_for()  { [ "$1" = prd ] && echo "production" || echo "dev"; }
branch_for()  { [ "$1" = prd ] && echo "main" || echo "dev"; }
ssm_arn()     { echo "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/${APP}/$1/$2"; }
rand()        { openssl rand -base64 36 | tr -d '/+=' | cut -c1-32; }
role_arn()    { echo "arn:aws:iam::${ACCOUNT_ID}:role/$1"; }

ssm_put_if_missing() { # name value [type]
  if aws ssm get-parameter --name "$1" >/dev/null 2>&1; then ok "SSM exists: $1"; else
    aws ssm put-parameter --name "$1" --value "$2" --type "${3:-SecureString}" --tags "Key=app,Value=$APP" >/dev/null
    ok "SSM created: $1"; fi
}
ssm_get() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text; }
ensure_role() { # name trust-json
  if aws iam get-role --role-name "$1" >/dev/null 2>&1; then aws iam update-assume-role-policy --role-name "$1" --policy-document "$2"; else
    aws iam create-role --role-name "$1" --assume-role-policy-document "$2" --tags "Key=app,Value=$APP" >/dev/null; sleep 8; fi
}
service_trust() { echo "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"$1\"},\"Action\":\"sts:AssumeRole\"}]}"; }
default_vpc()  { aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text; }
express_arn()  { aws ecs list-services --cluster "$APP" --query "serviceArns[?ends_with(@, '/${APP}-$1')] | [0]" --output text 2>/dev/null || echo None; }

# 카탈로그 이미지는 products 버킷으로 통합됐다(2026-09-23) — 별도 카탈로그 버킷 없음.
# 카드 이미지는 products 버킷 cards/wm(공개)·cards/clean(비공개) 프리픽스에 산다.
catalog_bucket()      { echo "${APP}-kr-products-$1"; }               # env (= products bucket)
catalog_public_base() { echo "https://$(catalog_bucket "$1").s3.${REGION}.amazonaws.com"; } # env

# Public-read policy for the products bucket — prefix allow-list. products/clean/·cards/clean/
# (watermark-free originals) stay private and are served only through owner/admin routes.
products_bucket_policy() { # bucket
  echo "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"PublicReadPrefixes\",\"Effect\":\"Allow\",\"Principal\":\"*\",\"Action\":\"s3:GetObject\",\"Resource\":[\"arn:aws:s3:::$1/products/original/*\",\"arn:aws:s3:::$1/notices/*\",\"arn:aws:s3:::$1/banners/*\",\"arn:aws:s3:::$1/avatars/*\",\"arn:aws:s3:::$1/used/*\",\"arn:aws:s3:::$1/cards/original/*\",\"arn:aws:s3:::$1/cards/wm/*\"]}]}"
}
app_user_s3_policy() { # pub ugc  (카드 이미지가 products=pub 에 있어 별도 카탈로그 버킷 불필요)
  echo "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\"],\"Resource\":[\"arn:aws:s3:::$1\",\"arn:aws:s3:::$1/*\",\"arn:aws:s3:::$2\",\"arn:aws:s3:::$2/*\"]}]}"
}

# Express primary container JSON for an environment — single source for `ecs` (create/update).
container_json() { # env image
  local e=$1 image=$2 dom lg="/ecs/${APP}-$1"; dom=$(domain_for "$e")
  local secrets="["; for s in DATABASE_URL R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY KAKAO_REST_API_KEY KAKAO_CLIENT_SECRET VAPID_PRIVATE_KEY VAPID_SUBJECT CRON_SECRET; do
    secrets+="{\"name\":\"$s\",\"valueFrom\":\"$(ssm_arn "$e" "$s")\"},"; done; secrets="${secrets%,}]"
  local envs="[{\"name\":\"APP_URL\",\"value\":\"https://${dom}\"},{\"name\":\"R2_ENDPOINT\",\"value\":\"https://s3.${REGION}.amazonaws.com\"},{\"name\":\"R2_REGION\",\"value\":\"${REGION}\"},{\"name\":\"R2_BUCKET\",\"value\":\"${APP}-kr-products-${e}\"},{\"name\":\"R2_PUBLIC_BASE\",\"value\":\"https://${APP}-kr-products-${e}.s3.${REGION}.amazonaws.com\"},{\"name\":\"R2_UGC_BUCKET\",\"value\":\"${APP}-kr-ugc-${e}\"},{\"name\":\"CATALOG_BUCKET\",\"value\":\"$(catalog_bucket "$e")\"},{\"name\":\"CATALOG_PUBLIC_BASE\",\"value\":\"$(catalog_public_base "$e")\"},{\"name\":\"PAYMENT_PROVIDER\",\"value\":\"mock\"},{\"name\":\"NEXT_TELEMETRY_DISABLED\",\"value\":\"1\"}]"
  echo "{\"image\":\"${image}\",\"containerPort\":3000,\"awsLogsConfiguration\":{\"logGroup\":\"${lg}\",\"logStreamPrefix\":\"ecs\"},\"environment\":${envs},\"secrets\":${secrets}}"
}

# ───────────────────────────── core ─────────────────────────────
phase_core() {
  say "ECR repository"
  aws ecr describe-repositories --repository-names "$APP" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$APP" --image-scanning-configuration scanOnPush=true \
         --image-tag-mutability MUTABLE --tags "Key=app,Value=$APP" >/dev/null
  aws ecr put-lifecycle-policy --repository-name "$APP" --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"keep last 30 images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":30},"action":{"type":"expire"}}]}' >/dev/null
  ok "ecr: $ECR_URI"

  for e in $ENVS; do
    say "S3 buckets ($e)"
    local pub="${APP}-kr-products-${e}" ugc="${APP}-kr-ugc-${e}"
    for b in "$pub" "$ugc"; do
      # Bucket names are global; recreating a just-deleted name (e.g. after a region move) can be
      # refused with OperationAborted for a while — retry.
      if ! aws s3api head-bucket --bucket "$b" 2>/dev/null; then
        for i in $(seq 1 30); do
          aws s3api create-bucket --bucket "$b" --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null 2>/tmp/${APP}-s3.err && break
          grep -q OperationAborted /tmp/${APP}-s3.err || { cat /tmp/${APP}-s3.err; die "create-bucket $b failed"; }
          [ "$i" = 1 ] && warn "$b: name still releasing from previous deletion — retrying every 30s"
          sleep 30
        done
        aws s3api head-bucket --bucket "$b" >/dev/null 2>&1 || die "create-bucket $b failed"
      fi
      aws s3api put-bucket-tagging --bucket "$b" --tagging "TagSet=[{Key=app,Value=$APP},{Key=env,Value=$e}]"
      aws s3api put-bucket-encryption --bucket "$b" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
    done
    # products: public read (catalog images are served by URL)
    aws s3api put-public-access-block --bucket "$pub" --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false"
    aws s3api put-bucket-policy --bucket "$pub" --policy "$(products_bucket_policy "$pub")"
    # ugc: private, signed GET only; tmp uploads expire after a day
    aws s3api put-public-access-block --bucket "$ugc" --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    aws s3api put-bucket-lifecycle-configuration --bucket "$ugc" --lifecycle-configuration \
      '{"Rules":[{"ID":"expire-tmp","Status":"Enabled","Filter":{"Prefix":"posts/tmp/"},"Expiration":{"Days":1}}]}'
    # Browser-side presigned PUT (avatars, post photos) needs CORS on both buckets.
    local cors='{"CORSRules":[{"AllowedOrigins":["https://iroiro.club","https://www.iroiro.club","https://dev.iroiro.club","http://localhost:3000"],"AllowedMethods":["GET","PUT","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}]}'
    aws s3api put-bucket-cors --bucket "$pub" --cors-configuration "$cors"
    aws s3api put-bucket-cors --bucket "$ugc" --cors-configuration "$cors"
    ok "$pub (public read), $ugc (private), CORS on both"

    say "App IAM user for S3 ($e)"
    local user="${APP}-app-${e}"
    aws iam get-user --user-name "$user" >/dev/null 2>&1 || aws iam create-user --user-name "$user" --tags "Key=app,Value=$APP" >/dev/null
    aws iam put-user-policy --user-name "$user" --policy-name s3-buckets --policy-document "$(app_user_s3_policy "$pub" "$ugc")"
    if ! aws ssm get-parameter --name "/${APP}/${e}/R2_ACCESS_KEY_ID" >/dev/null 2>&1; then
      local key; key=$(aws iam create-access-key --user-name "$user" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
      ssm_put_if_missing "/${APP}/${e}/R2_ACCESS_KEY_ID"     "$(echo "$key" | cut -f1)"
      ssm_put_if_missing "/${APP}/${e}/R2_SECRET_ACCESS_KEY" "$(echo "$key" | cut -f2)"
    else ok "access key already stored in SSM"; fi

    say "SSM placeholders for app secrets ($e)"
    for s in KAKAO_REST_API_KEY KAKAO_CLIENT_SECRET VAPID_PRIVATE_KEY VAPID_SUBJECT; do
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
  # GitHub may issue "immutable subject" claims (repo:Owner@<ownerId>/name@<repoId>:...). Trust both
  # the plain and the immutable prefix; the ids come from the GitHub API when gh is available.
  local prefixes="repo:${GH_REPO}"
  if command -v gh >/dev/null 2>&1; then
    local owner_id repo_id; owner_id=$(gh api "repos/${GH_REPO}" --jq .owner.id 2>/dev/null || true); repo_id=$(gh api "repos/${GH_REPO}" --jq .id 2>/dev/null || true)
    [ -n "$owner_id" ] && [ -n "$repo_id" ] && prefixes="$prefixes repo:${GH_REPO%%/*}@${owner_id}/${GH_REPO##*/}@${repo_id}"
  fi
  local subs=""; for pfx in $prefixes; do for s in "ref:refs/heads/dev" "ref:refs/heads/main" "environment:dev" "environment:production"; do subs+="\"${pfx}:${s}\","; done; done; subs="${subs%,}"
  ensure_role "$role" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Federated\":\"${oidc_arn}\"},\"Action\":\"sts:AssumeRoleWithWebIdentity\",\"Condition\":{\"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\"},\"StringLike\":{\"token.actions.githubusercontent.com:sub\":[${subs}]}}}]}"
  aws iam put-role-policy --role-name "$role" --policy-name deploy --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:CompleteLayerUpload\",\"ecr:InitiateLayerUpload\",\"ecr:PutImage\",\"ecr:UploadLayerPart\",\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],\"Resource\":\"arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${APP}\"},
    {\"Effect\":\"Allow\",\"Action\":[\"ecs:UpdateService\",\"ecs:DescribeServices\"],\"Resource\":\"arn:aws:ecs:${REGION}:${ACCOUNT_ID}:service/${APP}/${APP}-*\"}]}"
  ok "role: $(role_arn "$role")"
}

# ───────────────────────────── db ─────────────────────────────
phase_db() {
  local vpc; vpc=$(default_vpc); [ "$vpc" != "None" ] || die "default VPC not found in $REGION"
  local cidr; cidr=$(aws ec2 describe-vpcs --vpc-ids "$vpc" --query 'Vpcs[0].CidrBlock' --output text)
  local my_ip; my_ip="$(curl -s https://checkip.amazonaws.com)/32"
  local ver; ver=$(aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[?starts_with(EngineVersion,'17.')].EngineVersion | [-1]" --output text)
  for e in $ENVS; do
    say "RDS PostgreSQL $ver ($e)"
    local sg_name="${APP}-db-${e}" id="${APP}-${e}"
    local sg; sg=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$sg_name" "Name=vpc-id,Values=$vpc" --query 'SecurityGroups[0].GroupId' --output text)
    if [ "$sg" = "None" ]; then
      sg=$(aws ec2 create-security-group --group-name "$sg_name" --description "iroiro $e postgres" --vpc-id "$vpc" --query GroupId --output text)
      aws ec2 create-tags --resources "$sg" --tags "Key=app,Value=$APP" "Key=env,Value=$e"
    fi
    # Ingress: the VPC (ECS tasks) + the operator's current IP. db-apply.sh adds new operator IPs on demand.
    aws ec2 authorize-security-group-ingress --group-id "$sg" --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$cidr,Description=vpc}]" >/dev/null 2>&1 || true
    aws ec2 authorize-security-group-ingress --group-id "$sg" --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$my_ip,Description=operator}]" >/dev/null 2>&1 || true
    aws ec2 revoke-security-group-ingress --group-id "$sg" --protocol tcp --port 5432 --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
    ok "security group $sg (5432 from $cidr, $my_ip)"
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
    # verify-full against the RDS CA bundle baked into the image (Dockerfile). pg treats sslmode=require as verifying too.
    ssm_put_if_missing "/${APP}/${e}/DATABASE_URL"       "postgresql://app:$(rand)@${host}:5432/iroiro?sslmode=verify-full&sslrootcert=/app/rds-ca.pem"
    ok "$id → $host"
  done
  warn "next: ./infra/aws/db-apply.sh <env>  (applies db/schema.sql and grants the app role LOGIN)"
}

# ───────────────────────────── ecs ─────────────────────────────
phase_ecs() {
  say "ECS cluster $APP"
  [ "$(aws ecs describe-clusters --clusters "$APP" --query 'clusters[0].status' --output text 2>/dev/null)" = ACTIVE ] \
    || aws ecs create-cluster --cluster-name "$APP" --tags "key=app,value=$APP" >/dev/null
  ok "cluster active"

  say "ECS roles"
  local infra_role="${APP}-ecs-infrastructure"
  ensure_role "$infra_role" "$(service_trust ecs.amazonaws.com)"
  aws iam attach-role-policy --role-name "$infra_role" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRoleforExpressGatewayServices
  ok "$infra_role"

  for e in $ENVS; do
    say "Express service ${APP}-${e}"
    local exec_role="${APP}-ecs-execution-${e}"
    ensure_role "$exec_role" "$(service_trust ecs-tasks.amazonaws.com)"
    aws iam attach-role-policy --role-name "$exec_role" --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    aws iam put-role-policy --role-name "$exec_role" --policy-name ssm-secrets --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"ssm:GetParameters\",\"ssm:GetParameter\"],\"Resource\":\"arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/${APP}/${e}/*\"},{\"Effect\":\"Allow\",\"Action\":\"kms:Decrypt\",\"Resource\":\"*\",\"Condition\":{\"StringEquals\":{\"kms:ViaService\":\"ssm.${REGION}.amazonaws.com\"}}}]}"
    local lg="/ecs/${APP}-${e}"
    aws logs describe-log-groups --log-group-name-prefix "$lg" --query "logGroups[?logGroupName=='$lg'] | [0]" --output text | grep -q . \
      || { aws logs create-log-group --log-group-name "$lg" --tags "app=$APP,env=$e"; aws logs put-retention-policy --log-group-name "$lg" --retention-in-days 30; }
    local image="${ECR_URI}:${e}-latest"
    aws ecr describe-images --repository-name "$APP" --image-ids "imageTag=${e}-latest" >/dev/null 2>&1 \
      || die "image ${image} not found — push it first (CI on branch '$(branch_for "$e")', or docker push)"
    local container; container=$(container_json "$e" "$image")
    local cpu=512 mem=1024 max=2; [ "$e" = prd ] && { cpu=1024; mem=2048; max=3; }
    local arn; arn=$(express_arn "$e")
    if [ "$arn" = "None" ] || [ -z "$arn" ]; then
      arn=$(aws ecs create-express-gateway-service --cluster "$APP" --service-name "${APP}-${e}" \
        --execution-role-arn "$(role_arn "$exec_role")" --infrastructure-role-arn "$(role_arn "$infra_role")" \
        --health-check-path /api/health --primary-container "$container" --cpu "$cpu" --memory "$mem" \
        --scaling-target "minTaskCount=1,maxTaskCount=${max},autoScalingMetric=AVERAGE_CPU,autoScalingTargetValue=60" \
        --tags "key=app,value=$APP" "key=env,value=$e" --query 'service.serviceArn' --output text)
      ok "creating $arn"
    else
      warn "service exists — updating container config (re-run 'domains' afterwards: an Express update can reset ALB host rules)"
      aws ecs update-express-gateway-service --service-arn "$arn" --primary-container "$container" --cpu "$cpu" --memory "$mem" >/dev/null
    fi
  done
  for e in $ENVS; do
    local arn; arn=$(express_arn "$e")
    say "waiting for ${APP}-${e}"
    for i in $(seq 1 60); do
      local st; st=$(aws ecs describe-express-gateway-service --service-arn "$arn" --query 'service.status.statusCode' --output text)
      case "$st" in ACTIVE) break ;; *FAIL*|INACTIVE) die "service status $st — $(aws ecs describe-express-gateway-service --service-arn "$arn" --query 'service.status.statusReason' --output text)" ;; esac
      sleep 15
    done
    aws ecs describe-express-gateway-service --service-arn "$arn" --query 'service.activeConfigurations[0].ingressPaths[].endpoint' --output text | sed 's/^/  https:\/\//'
    say "waiting for ${APP}-${e} tasks to pass the ALB health check"
    aws ecs wait services-stable --cluster "$APP" --services "${APP}-${e}" || warn "not stable yet — check: aws ecs describe-services --cluster $APP --services ${APP}-${e} --query 'services[0].events[:5]'"
    ok "running/desired: $(aws ecs describe-services --cluster "$APP" --services "${APP}-${e}" --query 'services[0].[runningCount,desiredCount]' --output text | tr '\t' '/')" 
  done
}

# ───────────────────────────── github ─────────────────────────────
phase_github() {
  command -v gh >/dev/null || die "gh CLI required"
  local role; role=$(role_arn "${APP}-github-deploy")
  local all_ready=true
  for e in $ENVS; do
    local ghe; ghe=$(gh_env_for "$e")
    say "GitHub environment '$ghe'"
    gh api -X PUT "repos/${GH_REPO}/environments/${ghe}" >/dev/null
    gh variable set AWS_ROLE_ARN   --env "$ghe" --body "$role" -R "$GH_REPO"
    gh variable set ECR_REPOSITORY --env "$ghe" --body "$APP"  -R "$GH_REPO"
    gh variable set ECS_CLUSTER    --env "$ghe" --body "$APP"  -R "$GH_REPO"
    gh variable set ECS_SERVICE    --env "$ghe" --body "${APP}-${e}" -R "$GH_REPO"
    [ "$(express_arn "$e")" != "None" ] || all_ready=false
    ok "AWS_ROLE_ARN, ECR_REPOSITORY, ECS_CLUSTER, ECS_SERVICE set"
  done
  # Repo-level gate read by deploy.yml's job-level `if`. IMAGE_ONLY=1 enables the workflow before the
  # services exist so CI can push the first image (the ECS step then fails, which is expected).
  if [ "$all_ready" = true ] || [ -n "${IMAGE_ONLY:-}" ]; then gh variable set DEPLOY_ENABLED --body true -R "$GH_REPO"; ok "DEPLOY_ENABLED=true"; else warn "DEPLOY_ENABLED left unset — services missing"; fi
}

# ───────────────────────────── domains ─────────────────────────────
# Express services deploy blue/green: each owns two target groups and one "production" listener rule
# on the shared ALB. We add our hostnames to that rule's host-header condition and attach the cert.
prod_rule_for() { # env → production listener rule ARN
  local rev; rev=$(aws ecs describe-express-gateway-service --service-arn "$(express_arn "$1")" --query 'service.activeConfigurations[0].serviceRevisionArn' --output text)
  aws ecs describe-service-revisions --service-revision-arns "$rev" --query 'serviceRevisions[0].loadBalancers[0].advancedConfiguration.productionListenerRule' --output text
}
phase_domains() {
  say "ACM certificate ($REGION) for $DOMAIN + *.$DOMAIN"
  local cert; cert=$(aws acm list-certificates --query "CertificateSummaryList[?DomainName=='${DOMAIN}'].CertificateArn | [0]" --output text)
  if [ "$cert" = "None" ] || [ -z "$cert" ]; then
    cert=$(aws acm request-certificate --domain-name "$DOMAIN" --subject-alternative-names "*.${DOMAIN}" --validation-method DNS --tags "Key=app,Value=$APP" --query CertificateArn --output text); sleep 10
  fi
  aws acm describe-certificate --certificate-arn "$cert" --query 'Certificate.DomainValidationOptions[].ResourceRecord.[Name,Value]' --output text | sort -u | sed 's/^/  validation CNAME  /'
  for i in $(seq 1 40); do
    local st; st=$(aws acm describe-certificate --certificate-arn "$cert" --query 'Certificate.Status' --output text)
    [ "$st" = ISSUED ] && break; [ "$i" = 1 ] && warn "certificate $st — waiting (add the validation CNAME at Squarespace if not present)"; sleep 15
  done
  [ "$(aws acm describe-certificate --certificate-arn "$cert" --query 'Certificate.Status' --output text)" = ISSUED ] || die "certificate not issued yet — rerun 'domains' once the validation CNAME propagates"
  ok "certificate issued"

  local alb_dns=""
  for e in $ENVS; do
    say "ALB host rule for ${APP}-${e}"
    local rule; rule=$(prod_rule_for "$e"); [ "$rule" != "None" ] && [ -n "$rule" ] || die "no production listener rule for ${APP}-${e}"
    local listener; listener=$(aws elbv2 describe-rules --rule-arns "$rule" --query 'Rules[0].RuleArn' --output text | sed -E 's#:listener-rule/#:listener/#; s#/[^/]+$##')
    aws elbv2 add-listener-certificates --listener-arn "$listener" --certificates "CertificateArn=$cert" >/dev/null
    aws elbv2 describe-rules --rule-arns "$rule" --output json > /tmp/${APP}-rule.json
    python3 - $(hosts_for "$e") <<'PY2'
import json, sys, subprocess
hosts = sys.argv[1:]
r = json.load(open("/tmp/iroiro-rule.json"))["Rules"][0]
conds, seen = [], False
for c in r["Conditions"]:
    if c["Field"] == "host-header":
        vals = list(dict.fromkeys(c["HostHeaderConfig"]["Values"] + hosts)); seen = True
        conds.append({"Field": "host-header", "HostHeaderConfig": {"Values": vals}})
    else:
        conds.append({k: v for k, v in c.items() if k in ("Field", "PathPatternConfig", "HttpHeaderConfig", "QueryStringConfig", "SourceIpConfig", "HttpRequestMethodConfig")})
if not seen: vals = hosts; conds.append({"Field": "host-header", "HostHeaderConfig": {"Values": hosts}})
subprocess.run(["aws", "elbv2", "modify-rule", "--rule-arn", r["RuleArn"], "--conditions", json.dumps(conds)], check=True, stdout=subprocess.DEVNULL)
print("  hosts:", ", ".join(vals))
PY2
    local alb; alb=$(aws elbv2 describe-listeners --listener-arns "$listener" --query 'Listeners[0].LoadBalancerArn' --output text)
    alb_dns=$(aws elbv2 describe-load-balancers --load-balancer-arns "$alb" --query 'LoadBalancers[0].DNSName' --output text)
  done
  echo
  echo "  Squarespace DNS (shared ALB):"
  printf '    ALIAS  @    %s\n    CNAME  www  %s\n    CNAME  dev  %s\n' "$alb_dns" "$alb_dns" "$alb_dns"
}

# ───────────────────────────── cron ─────────────────────────────
phase_cron() {
  local role="${APP}-events-apidest"
  ensure_role "$role" "$(service_trust events.amazonaws.com)"
  aws iam put-role-policy --role-name "$role" --policy-name invoke --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"events:InvokeApiDestination\",\"Resource\":\"arn:aws:events:${REGION}:${ACCOUNT_ID}:api-destination/${APP}-*\"}]}"
  for e in $ENVS; do
    say "EventBridge cron ($e) — close-auctions every 10 min"
    local secret; secret=$(ssm_get "/${APP}/${e}/CRON_SECRET")
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
    aws events put-targets --rule "$dest" --targets "Id=api,Arn=${dest_arn},RoleArn=$(role_arn "$role")" >/dev/null
    ok "$dest → https://${dom}/api/cron/close-auctions"
  done
}

# ───────────────────────────── catalog ─────────────────────────────
# 카탈로그 이미지는 products 버킷으로 통합됐다 — 별도 카탈로그 버킷/DB 없음.
# 카드 이미지는 products 버킷 cards/wm(공개)·cards/clean(비공개)에 산다. 여기선 products 버킷
# 공개 정책(cards/wm 포함)과 앱 IAM(products·ugc) 만 보장한다.
phase_catalog() {
  for e in $ENVS; do
    say "App IAM user S3 policy + products bucket prefix policy ($e)"
    local pub="${APP}-kr-products-${e}" ugc="${APP}-kr-ugc-${e}"
    aws iam put-user-policy --user-name "${APP}-app-${e}" --policy-name s3-buckets --policy-document "$(app_user_s3_policy "$pub" "$ugc")"
    aws s3api put-bucket-policy --bucket "$pub" --policy "$(products_bucket_policy "$pub")"
    ok "$pub public read: prefixes incl cards/wm (products/clean·cards/clean private)"
  done
  warn "next: run 'ecs' and 'domains' to push CATALOG_BUCKET=products into the task def."
}

# ───────────────────────────── migrate ─────────────────────────────
# One-off Fargate task per environment that runs scripts/db-migrate.mjs against the commerce DB (owner URL).
# deploy.yml runs it before rolling the service; the task uses the freshly pushed <env>-latest image.
phase_migrate() {
  local vpc; vpc=$(default_vpc)
  for e in $ENVS; do
    say "migration task definition ${APP}-migrate-${e}"
    local exec_role; exec_role=$(role_arn "${APP}-ecs-execution-${e}")
    local lg="/ecs/${APP}-${e}"
    local secrets="[{\"name\":\"DATABASE_URL_OWNER\",\"valueFrom\":\"$(ssm_arn "$e" DATABASE_URL_OWNER)\"}]"
    local container="[{\"name\":\"migrate\",\"image\":\"${ECR_URI}:${e}-latest\",\"essential\":true,\"command\":[\"node\",\"scripts/db-migrate.mjs\"],\"environment\":[{\"name\":\"MIGRATE_TARGETS\",\"value\":\"commerce\"}],\"secrets\":${secrets},\"logConfiguration\":{\"logDriver\":\"awslogs\",\"options\":{\"awslogs-group\":\"${lg}\",\"awslogs-region\":\"${REGION}\",\"awslogs-stream-prefix\":\"migrate\"}}}]"
    aws ecs register-task-definition --family "${APP}-migrate-${e}" --requires-compatibilities FARGATE --network-mode awsvpc \
      --cpu 256 --memory 512 --execution-role-arn "$exec_role" --runtime-platform "cpuArchitecture=X86_64,operatingSystemFamily=LINUX" \
      --container-definitions "$container" --tags "key=app,value=$APP" "key=env,value=$e" --query 'taskDefinition.taskDefinitionArn' --output text | sed 's/^/  /'
  done

  say "deploy role: allow run-task for the migration tasks"
  local role="${APP}-github-deploy" exec_roles="" taskdefs=""
  for e in $ENVS; do
    exec_roles+="\"$(role_arn "${APP}-ecs-execution-${e}")\","
    taskdefs+="\"arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task-definition/${APP}-migrate-${e}:*\","
  done
  aws iam put-role-policy --role-name "$role" --policy-name deploy-migrate --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ecs:RunTask\",\"Resource\":[${taskdefs%,}],\"Condition\":{\"ArnEquals\":{\"ecs:cluster\":\"arn:aws:ecs:${REGION}:${ACCOUNT_ID}:cluster/${APP}\"}}},
    {\"Effect\":\"Allow\",\"Action\":\"ecs:DescribeTasks\",\"Resource\":\"arn:aws:ecs:${REGION}:${ACCOUNT_ID}:task/${APP}/*\"},
    {\"Effect\":\"Allow\",\"Action\":\"iam:PassRole\",\"Resource\":[${exec_roles%,}],\"Condition\":{\"StringEquals\":{\"iam:PassedToService\":\"ecs-tasks.amazonaws.com\"}}},
    {\"Effect\":\"Allow\",\"Action\":[\"ec2:DescribeVpcs\",\"ec2:DescribeSubnets\",\"ec2:DescribeSecurityGroups\"],\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"logs:GetLogEvents\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:log-group:/ecs/${APP}-*:*\"}]}"
  ok "policy deploy-migrate on $role (vpc $vpc)"
}

# ───────────────────────────── status ─────────────────────────────
phase_status() {
  say "account $ACCOUNT_ID / $REGION"
  aws ecr describe-images --repository-name "$APP" --query 'imageDetails[].imageTags[]' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  image: /'
  aws s3api list-buckets --query "Buckets[?starts_with(Name,'${APP}-')].Name" --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  s3: /'
  aws rds describe-db-instances --query "DBInstances[?starts_with(DBInstanceIdentifier,'${APP}-')].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]" --output text 2>/dev/null | sed 's/^/  rds: /'
  for e in $ENVS; do
    local arn; arn=$(express_arn "$e"); [ "$arn" != "None" ] || continue
    aws ecs describe-express-gateway-service --service-arn "$arn" --query 'service.[status.statusCode, activeConfigurations[0].ingressPaths[0].endpoint]' --output text | sed "s/^/  ecs ${APP}-${e}: /"
    aws ecs describe-services --cluster "$APP" --services "${APP}-${e}" --query 'services[0].[runningCount,desiredCount]' --output text | sed 's/^/    tasks running\/desired: /'
    aws ssm get-parameters-by-path --path "/${APP}/${e}" --with-decryption --query "Parameters[?Value=='CHANGE_ME'].Name" --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  TODO secret: /'
  done
}

case "${1:-}" in
  core) phase_core ;; db) phase_db ;; ecs) phase_ecs ;; github) phase_github ;; domains) phase_domains ;; cron) phase_cron ;;
  catalog) phase_catalog ;; migrate) phase_migrate ;; status) phase_status ;;
  *) sed -n 2,19p "$0"; exit 1 ;;
esac
