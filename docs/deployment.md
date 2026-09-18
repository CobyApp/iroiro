# 배포·브랜치 전략

> 살아있는 문서. 인프라 스크립트의 단일 진실은 [`infra/aws/setup.sh`](../infra/aws/setup.sh),
> CI/CD의 단일 진실은 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)이다.

## 환경

| 환경 | 브랜치 | 도메인 | AWS 리소스 | GitHub Environment |
|---|---|---|---|---|
| dev | `dev` | https://dev.iroiro.club | App Runner `iroiro-dev` · RDS `iroiro-dev` · S3 `iroiro-products-dev` / `iroiro-ugc-dev` | `dev` |
| prd | `main` | https://iroiro.club (+ www) | App Runner `iroiro-prd` · RDS `iroiro-prd` · S3 `iroiro-products-prd` / `iroiro-ugc-prd` | `production` |

- 리전은 **도쿄(ap-northeast-1)** — App Runner가 서울 리전에 없다. 계정 `852382801109`, CLI 프로파일 `personal`.
- DB는 환경별로 **완전히 분리된 RDS 인스턴스**(PostgreSQL 17, db.t4g.micro, 20GB gp3, 단일 AZ). prd는 삭제 보호 + 7일 백업.
- 시크릿은 SSM Parameter Store `/iroiro/<env>/<NAME>`(SecureString)에 두고 App Runner가 기동 시 주입한다. 코드·CI에는 시크릿이 없다.
- 이미지 스토리지는 AWS S3. 앱 코드의 `R2_*` 환경변수 이름은 그대로 두고 값만 S3를 가리킨다(`R2_REGION=ap-northeast-1`).

## 브랜치 전략

```
feature/* ──PR──▶ dev ──(자동 배포)──▶ dev.iroiro.club
                   │
                   └──PR (release)──▶ main ──(자동 배포)──▶ iroiro.club
hotfix/*  ──PR──▶ main  (그리고 main → dev 로 back-merge)
```

1. 모든 작업은 `dev`에서 분기한 `feature/<주제>` 브랜치 → `dev`로 PR. CI(`ci.yml`: lint · typecheck · test)가 통과해야 머지.
2. `dev`에 머지되면 `deploy.yml`이 dev 환경으로 자동 배포한다.
3. 릴리스는 `dev → main` PR. 머지되면 prd로 자동 배포.
4. 긴급 수정은 `hotfix/*` → `main` PR 후, `main`을 `dev`로 back-merge해 두 브랜치가 갈라지지 않게 한다.
5. `main`·`dev`에는 직접 push하지 않는다(브랜치 보호 규칙: PR 필수 · CI 필수 · 최신화 필수).

## CI/CD 흐름 (`deploy.yml`)

1. `npm ci` → lint · typecheck · test
2. GitHub Actions 서비스 컨테이너(Postgres 17)에 `db/schema.sql` 적용 — Next 빌드가 프리렌더 중 DB를 읽기 때문
3. `next build` (standalone) — 런타임 시크릿은 빌드 시 placeholder, `NEXT_PUBLIC_*`만 GitHub Environment 변수에서 주입
4. OIDC로 `iroiro-github-deploy` 롤 assume → ECR `iroiro:<env>-<sha>` / `iroiro:<env>-latest` 푸시
5. `aws apprunner start-deployment` → 완료까지 폴링. 실패 시 App Runner가 이전 이미지로 자동 롤백

Environment 변수(`setup.sh github`가 설정): `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `APPRUNNER_SERVICE_ARN`, (선택) `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
리포 변수 `DEPLOY_ENABLED`가 `true`가 아니면 deploy job은 스킵된다(인프라 준비 전 push해도 실패로 남지 않음).

## 최초 프로비저닝 순서

```bash
./infra/aws/setup.sh core        # ECR · S3 · 앱용 IAM 사용자(S3 키 → SSM) · 시크릿 placeholder · GitHub OIDC 롤
./infra/aws/setup.sh db          # RDS ×2 생성·대기, DATABASE_URL / DATABASE_URL_OWNER → SSM   (~10분)
./infra/aws/db-apply.sh dev      # 스키마 적용 + app 롤 LOGIN
./infra/aws/db-apply.sh prd
IMAGE_ONLY=1 ./infra/aws/setup.sh github   # GitHub 변수 + DEPLOY_ENABLED → dev/main push가 이미지를 빌드·푸시
git push origin dev main         # 첫 이미지 (App Runner 서비스가 없으니 마지막 배포 단계는 실패해도 정상)
./infra/aws/setup.sh apprunner   # 서비스 생성 (이미지 필수)
./infra/aws/setup.sh github      # APPRUNNER_SERVICE_ARN 채움 → 이제부터 완전 자동 배포
./infra/aws/setup.sh domains     # Squarespace에 넣을 DNS 레코드 출력
./infra/aws/setup.sh cron        # CRON_SECRET 채운 뒤 — 경매 마감 스케줄러
./infra/aws/setup.sh status
```

### 사람이 채워야 하는 시크릿 (`CHANGE_ME` placeholder)

```bash
aws ssm put-parameter --profile personal --region ap-northeast-1 --overwrite --type SecureString \
  --name /iroiro/dev/KAKAO_REST_API_KEY --value '...'
```

| 이름 | 출처 |
|---|---|
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | developers.kakao.com — Redirect URI `https://<도메인>/api/auth/kakao/callback` 등록 |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | developers.naver.com — Callback `https://<도메인>/api/auth/naver/callback` |
| `CUTIE_CARD_API_KEY` | 카드 분석기 API |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` + GitHub 변수 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` (환경별로 별도 생성) |
| `CRON_SECRET` | `setup.sh core`가 자동 생성 |

시크릿을 바꾼 뒤에는 `aws apprunner start-deployment`(또는 해당 브랜치에 빈 커밋 push)로 재기동해야 반영된다.

### DNS (Squarespace)

`setup.sh domains` 출력 기준. ACM 검증용 CNAME 2~3개 + 아래 레코드.

| 유형 | 이름 | 값 |
|---|---|---|
| ALIAS | `@` | prd App Runner DNS target |
| CNAME | `www` | prd App Runner DNS target |
| CNAME | `dev` | dev App Runner DNS target |

## DB 스키마 변경 운영

- 정본은 [`db/schema.sql`](../db/schema.sql) 하나. 로컬은 `npm run db:reset`으로 재적용.
- dev/prd에는 **변경분 SQL을 별도로 작성해 `psql "$(aws ssm get-parameter --with-decryption --name /iroiro/<env>/DATABASE_URL_OWNER --query Parameter.Value --output text)"`로 적용**한다. 데이터가 있는 DB에 `db-apply.sh --reset`을 쓰지 않는다.
- 새 테이블에는 반드시 `GRANT ... TO app`을 함께 넣는다 — 앱은 비특권 `app` 롤로 접속하므로 GRANT가 없으면 permission denied.

## 비용 개요 (도쿄, 월 추정)

| 항목 | dev | prd |
|---|---|---|
| App Runner 1 vCPU / 2 GB (유휴 시 메모리만 과금) | ~$10–25 | ~$10–30 |
| RDS db.t4g.micro + 20GB gp3 | ~$15 | ~$15 |
| S3 · ECR · SSM · EventBridge | ~$1 | ~$1–3 |

트래픽이 거의 없는 기간에는 dev 서비스를 `aws apprunner pause-service`로 멈춰 App Runner 비용을 0에 가깝게 줄일 수 있다.

## 롤백

- App Runner: 콘솔 또는 `aws apprunner update-service --source-configuration`으로 이전 `iroiro:<env>-<sha>` 태그를 지정 후 `start-deployment`.
- Git: `main`에 revert 커밋을 머지하면 자동으로 이전 상태가 배포된다.
