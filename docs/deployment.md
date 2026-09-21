# 배포·브랜치 전략

> 살아있는 문서. 인프라 스크립트의 단일 진실은 [`infra/aws/setup.sh`](../infra/aws/setup.sh),
> CI/CD의 단일 진실은 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)이다.

## 환경

| 환경 | 브랜치 | 도메인 | AWS 리소스 | GitHub Environment |
|---|---|---|---|---|
| dev | `dev` | https://dev.iroiro.club | ECS Express `iroiro-dev`(0.5 vCPU / 1 GB) · RDS `iroiro-dev` · S3 `iroiro-products-dev` / `iroiro-ugc-dev` | `dev` |
| prd | `main` | https://iroiro.club (+ www) | ECS Express `iroiro-prd`(1 vCPU / 2 GB) · RDS `iroiro-prd` · S3 `iroiro-kr-products-prd` / `iroiro-kr-ugc-prd` | `production` |

- 컴퓨트는 **Amazon ECS Express Mode**(Fargate + 자동 생성 ALB). App Runner는 2026-04-30부터 신규 고객을 받지 않아 AWS가 권장하는 대체다. 두 서비스는 같은 클러스터 `iroiro`·같은 네트워크 설정을 써서 **ALB 1대를 공유**한다.
- 리전은 **서울(ap-northeast-2)**. 계정 `852382801109`, CLI 프로파일 `personal`. 기본 VPC(172.31.0.0/16)의 퍼블릭 서브넷에 Fargate 태스크가 뜬다(NAT 불필요).
- DB는 환경별로 **완전히 분리된 RDS 인스턴스**(PostgreSQL 17, db.t4g.micro, 20GB gp3, 단일 AZ). prd는 삭제 보호 + 7일 백업. 보안 그룹은 VPC CIDR(ECS 태스크)과 명시적으로 허용한 운영자 IP만 5432를 열어 둔다(`db-apply.sh`가 현재 IP를 자동 추가).
- 앱→RDS 연결은 `sslmode=verify-full&sslrootcert=/app/rds-ca.pem`. RDS CA 번들은 Dockerfile이 이미지에 넣는다(`pg`는 `require`도 체인을 검증하므로 CA 없이는 self-signed 오류).
- 시크릿은 SSM Parameter Store `/iroiro/<env>/<NAME>`(SecureString)에 두고 ECS 태스크 실행 롤이 기동 시 주입한다. 코드·CI에는 시크릿이 없다.
- 이미지 스토리지는 AWS S3. 앱 코드의 `R2_*` 환경변수 이름은 그대로 두고 값만 S3를 가리킨다(`R2_REGION=ap-northeast-2`).

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
5. `aws ecs update-service --force-new-deployment` → `wait services-stable`. 헬스체크(`/api/health`) 실패 시 ECS 배포 서킷 브레이커가 이전 태스크를 유지한다.
   (`update-express-gateway-service`를 쓰지 않는 이유: Express 업데이트는 ALB를 재조정해 `domains` 단계가 넣은 커스텀 도메인 호스트 규칙을 지울 수 있다.)

Environment 변수(`setup.sh github`가 설정): `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, (선택) `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
리포 변수 `DEPLOY_ENABLED`가 `true`가 아니면 deploy job은 스킵된다(인프라 준비 전 push해도 실패로 남지 않음).

## 최초 프로비저닝 순서

```bash
./infra/aws/setup.sh core        # ECR · S3 · 앱용 IAM 사용자(S3 키 → SSM) · 시크릿 placeholder · GitHub OIDC 롤
./infra/aws/setup.sh db          # RDS ×2 생성·대기, DATABASE_URL / DATABASE_URL_OWNER → SSM   (~10분)
./infra/aws/db-apply.sh dev      # 스키마 적용 + app 롤 LOGIN
./infra/aws/db-apply.sh prd
# 첫 이미지: 로컬에서 `npm run build && docker build --platform linux/amd64` 후 ECR에 dev-latest/prd-latest로 push
./infra/aws/setup.sh ecs         # 클러스터·롤·Express 서비스 2개 (공유 ALB)
./infra/aws/setup.sh github      # GitHub Environment 변수 + DEPLOY_ENABLED → 이후 dev/main push가 자동 배포
./infra/aws/setup.sh domains     # 서울 ACM 인증서 + ALB 호스트 규칙, Squarespace에 넣을 DNS 레코드 출력
./infra/aws/setup.sh cron        # CRON_SECRET 채운 뒤 — 경매 마감 스케줄러
./infra/aws/setup.sh status
```

### 사람이 채워야 하는 시크릿 (`CHANGE_ME` placeholder)

```bash
aws ssm put-parameter --profile personal --region ap-northeast-2 --overwrite --type SecureString \
  --name /iroiro/dev/KAKAO_REST_API_KEY --value '...'
```

| 이름 | 출처 |
|---|---|
| `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET` | developers.kakao.com — Redirect URI `https://<도메인>/api/auth/kakao/callback` 등록 |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | developers.naver.com — Callback `https://<도메인>/api/auth/naver/callback` |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` + GitHub 변수 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` (환경별로 별도 생성) |
| `CRON_SECRET` | `setup.sh core`가 자동 생성 |

시크릿을 바꾼 뒤에는 `aws ecs update-service --cluster iroiro --service iroiro-<env> --force-new-deployment`(또는 해당 브랜치에 빈 커밋 push)로 재기동해야 반영된다.

### OAuth 콜백 URL

카카오·네이버 콘솔에는 환경마다 콜백을 등록한다 — `{APP_URL}/api/auth/kakao/callback`, `{APP_URL}/api/auth/naver/callback` (`APP_URL` = `https://iroiro.club` / `https://dev.iroiro.club` / `http://localhost:3000`). `APP_URL`은 `setup.sh ecs`가 태스크 정의에 환경별 도메인으로 고정한다. 콘솔 단계별 절차·검수·문제 해결은 [oauth-setup.md](./oauth-setup.md).

### DNS (Squarespace)

`setup.sh domains` 출력 기준. 인증서 검증 CNAME(`_xxx.iroiro.club`)은 us-east-1 인증서 때 넣은 것과 동일하므로 이미 있으면 그대로 두면 된다. 두 환경이 ALB를 공유하므로 세 레코드의 값이 같다.

| 유형 | 이름 | 값 |
|---|---|---|
| ALIAS | `@` | 공유 ALB DNS 이름 (`iroiro-….ap-northeast-2.elb.amazonaws.com`) |
| CNAME | `www` | 같은 ALB DNS 이름 |
| CNAME | `dev` | 같은 ALB DNS 이름 |

라우팅은 ALB 리스너의 host-header 규칙이 담당한다(iroiro.club·www → prd 타깃 그룹, dev.iroiro.club → dev 타깃 그룹). `setup.sh ecs`로 Express 서비스를 다시 업데이트했다면 `setup.sh domains`를 재실행해 규칙을 복구한다.

## DB 스키마 변경 운영

- 정본은 [`db/schema.sql`](../db/schema.sql) 하나. 로컬은 `npm run db:reset`으로 재적용.
- dev/prd에는 **변경분 SQL을 별도로 작성해 `psql "$(aws ssm get-parameter --with-decryption --name /iroiro/<env>/DATABASE_URL_OWNER --query Parameter.Value --output text)"`로 적용**한다. 데이터가 있는 DB에 `db-apply.sh --reset`을 쓰지 않는다.
- 새 테이블에는 반드시 `GRANT ... TO app`을 함께 넣는다 — 앱은 비특권 `app` 롤로 접속하므로 GRANT가 없으면 permission denied.

## 비용 개요 (서울, 월 추정)

| 항목 | dev | prd |
|---|---|---|
| Fargate (dev 0.5 vCPU/1 GB · prd 1 vCPU/2 GB, 상시 1 태스크) | ~$22 | ~$45 |
| ALB (두 환경 공유) | ~$18 (합산) | |
| RDS db.t4g.micro + 20GB gp3 | ~$15 | ~$15 |
| S3 · ECR · SSM · EventBridge | ~$1 | ~$1–3 |

트래픽이 거의 없는 기간에는 dev 서비스를 `aws ecs update-service --cluster iroiro --service iroiro-dev --desired-count 0`으로 멈춰 Fargate 비용을 0으로 줄일 수 있다(ALB 비용은 남는다).

## 롤백

- ECS: `aws ecr batch-get-image`/`put-image`로 이전 `iroiro:<env>-<sha>` 매니페스트를 `<env>-latest` 태그에 다시 붙인 뒤 `update-service --force-new-deployment`.
- Git: `main`에 revert 커밋을 머지하면 자동으로 이전 상태가 배포된다.
