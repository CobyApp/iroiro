# Supabase 도입 검토

Supabase를 도입·운영하면서 결정해야 할 사항을 모아두는 살아있는 문서.
선택 근거(왜 Supabase인가)는 [database-strategy.md](./database-strategy.md) 참조.

> 현재 단계: 정보 수집. 결정 사항 없음.

---

## 무료 플랜 할당량 (2026-05 기준)

### 한눈에 보기

| 영역 | 한도 |
|---|---|
| **Active free project** | **계정 전체에서 최대 2개** (organization 당이 아님) |
| **Database 용량** | 500 MB / project |
| **Database 리소스** | Shared CPU, 500 MB RAM |
| **Auth MAU** | 50,000 명 / 월 |
| **Third-Party Auth MAU** | 50,000 명 / 월 (별도 라인) |
| **Storage 용량** | 1 GB (≈ 744 GB-Hours / 월) |
| **파일 업로드 크기 한도** | 50 MB / 파일 |
| **Edge Functions 호출** | 500,000 / 월 |
| **Realtime 동시 연결** | 200 |
| **Realtime 메시지** | 2,000,000 / 월 |
| **Realtime 메시지 크기** | 256 KB |
| **Egress** (uncached — DB API, Auth, Edge, Realtime, Storage origin 직타) | 5 GB / 월 |
| **Cached Egress** (Storage CDN 캐시 히트 — 별도 한도, 합산 X) | 5 GB / 월 |
| **API 요청 수** | Unlimited |
| **Team 멤버** | Unlimited |

출처: [Supabase Pricing](https://supabase.com/pricing), [Edge Function Invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)

### 무료 플랜에 *포함되지 않는* 것

| 기능 | 무료 | 비고 |
|---|---|---|
| 자동 백업 | ❌ | Pro부터 |
| PITR (Point-in-Time Recovery) | ❌ | Pro 부가옵션 |
| Database Branching (preview·PR 별 DB) | ❌ | Pro부터 |
| Storage 이미지 변환 (Smart CDN transform) | ❌ | Pro부터 |
| Advanced MFA / SAML / SSO | ❌ | Basic MFA만 무료 |
| 이메일 지원 | ❌ | 커뮤니티 지원만 |
| Log 보관 | 1일 | Pro는 7일 |
| Audit Log 보관 | 1시간 | Pro는 더 김 |

출처: [Supabase Pricing](https://supabase.com/pricing)

---

## 항목별 세부

### Inactivity 일시정지

Free 프로젝트는 **7일간 활동이 없으면 자동으로 일시정지**된다. 일시정지 상태의 프로젝트는 트래픽을 받지 못하고, 다시 깨우려면 콘솔에서 수동 복원이 필요하다.

출처: [Supabase Pricing](https://supabase.com/pricing)

### MAU (Monthly Active Users) 정의

- 청구 주기(월) 동안 **로그인하거나 토큰을 갱신**한 **고유 사용자 수**
- 같은 사용자가 한 달에 N번 로그인하든, refresh token이 수백 번 회전하든 → **그 달 MAU는 1**
- 매월 cycle이 새로 시작되면 카운트도 0부터 다시 — 같은 사용자가 매달 활성이면 매달 1로 새로 잡힘 (누적 아님)
- 그 달 MAU 1로 잡히는 **트리거**:
  - 이메일/비밀번호 로그인
  - 소셜 로그인 (Google·GitHub 등)
  - Magic link 클릭으로 세션 발급
  - **Refresh token으로 access token 갱신** ← 사용자가 로그인 버튼을 누르지 않아도 트리거됨 (앱이 백그라운드에서 토큰만 갱신해도 그 달 MAU 1에 포함)
- 카운트되지 않는 행위:
  - 이미 발급된 token으로 보내는 일반 API 호출
  - 세션을 발급받지 않는 회원가입·로그아웃 단독 액션

출처: [Manage Monthly Active Users usage](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users)

### Third-Party MAU

- Clerk, Firebase Auth, Auth0, AWS Cognito 등 **외부 IDP에서 발급한 JWT를 Supabase로 가져와 검증한 사용자** 수
- 일반 MAU와는 별도 라인으로 집계되며, 무료 50,000 한도도 별도
- Supabase Auth만 쓰는 프로젝트는 이 라인이 0

출처: [Manage Monthly Active Third-Party Users usage](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-third-party)

### Project 한도와 한도 적용 단위 (Organization vs Project vs Account)

#### Free project 2개 한도는 **계정 단위**

- Free 플랜의 active project 한도는 한 계정이 owner/admin인 **모든 organization을 통틀어 최대 2개**
- organization을 여러 개 만들어도 free project 총합은 2를 넘을 수 없음
- 즉 "org를 더 만들면 무료 project가 늘어난다"는 **불가능**

| 구성 | Free 프로젝트 수 | 가능? |
|---|---|---|
| Org 1개에 free project 2개 | 2 | ✅ |
| Org 2개에 각각 free project 1개씩 | 2 | ✅ |
| Org 3개에 각각 free project 1개씩 | 3 | ❌ |

Pro 업그레이드 후엔: 한 org를 Pro로 올려도 **별도의 Free org에 free project 2개를 계속 유지 가능**. Pro 프로젝트는 그 위에 추가.

#### 한도별 적용 단위 매트릭스

한도마다 적용 단위가 다르다. **자원 계열은 project 별로 독립**, **사용량·트래픽 계열은 organization 단위로 합산**.

| 한도 | 적용 단위 | 의미 |
|---|---|---|
| Active free project 2개 | **Account** | 계정 전체에서 통산 2개 |
| DB 500 MB | **Project (각각)** | 각 project가 자체 DB. 2 projects = 2 × 500 MB |
| DB 리소스 (Shared CPU, 500 MB RAM) | **Project (각각)** | 각 project가 독립 인스턴스 |
| Storage 1 GB | **Organization (합산)** | 같은 org의 모든 project 합산 |
| MAU 50,000 | **Organization (합산)** | 같은 org의 모든 project 사용자 합산 |
| Third-Party MAU 50,000 | **Organization (합산)** | 위와 동일 |
| Egress 5 GB / Cached Egress 5 GB | **Organization (합산)** | 모든 project 트래픽 합산 |
| Edge Functions 500K 호출 | **Organization (합산)** | 모든 project 호출 합산 |
| Realtime 200 동시 연결 | **Project (각각)** | 프로젝트별 독립 |
| Realtime 메시지 2M / 월 | **Organization (합산)** | 모든 project 합산 |
| **청구** | **Organization** | 인보이스가 org 단위로 발행 |

일반 룰:
- **자원·인스턴스 계열(DB, 컴퓨팅, Realtime 연결) → project**: 각 project가 물리적으로 별개의 인스턴스라 서로 침범 안 함
- **사용량·트래픽 계열(Storage, MAU, Egress, Edge, Realtime 메시지) → organization**: 청구 목적으로 합산

#### Organization 분리의 의미

"2개 무료 프로젝트"라는 계정 총합은 어떻게 배치해도 변하지 않지만, **사용량 한도는 org 분리로 독립**시킬 수 있다.

| 배치 | Storage·MAU·Egress 한도 |
|---|---|
| Org 1개에 free project 2개 (prod + beta) | 두 프로젝트가 **5 GB egress / 1 GB storage / 50K MAU를 공유** |
| Org 2개에 각각 free project 1개 (prod / beta 분리) | 두 환경이 **각각 5 GB egress / 1 GB storage / 50K MAU를 독립적으로** 보유 |

#### oshikore-web 권장 배치

prod와 beta를 모두 무료로 운영하려면:

- **Org A (prod 전용)** → free project 1개 (prod) · 자체 한도 5 GB / 1 GB / 50K MAU
- **Org B (beta 전용)** → free project 1개 (beta) · 별도 한도 5 GB / 1 GB / 50K MAU

→ 계정의 free project 슬롯 2개 정확히 소진. 두 환경의 사용량은 독립적이라 beta 부하 테스트가 prod 한도를 잠식하지 않음.

향후 prod가 한도를 넘으면 **Org A만 Pro 업그레이드**, Org B(beta)는 그대로 Free 유지.

출처: [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase), [Keeping your 2 Free projects after upgrading to Pro](https://supabase.com/docs/guides/troubleshooting/keeping-free-projects-after-pro-upgrade-Kf9Xm2)

#### Organization 생성 시 "Type" 필드

Org 생성 시 묻는 Type 필드(Personal / Educational / Startup / Agency / Company)는 **사용량 한도나 과금에 영향이 없다**. Supabase 내부 분류·분석·마케팅 컨텐츠 추천 용도이며, org 설정에서 언제든 변경 가능.

비과금 영향 항목:
- 받게 되는 마케팅/뉴스레터 컨텐츠 톤
- 추천되는 가이드·튜토리얼
- 영업/CS팀 outreach (Company·Startup이면 연락 올 가능성 있음)

| 선택지 | oshikore-web 적합도 | 이유 |
|---|---|---|
| **Personal** | ✅ 권장 (prod·beta 모두) | 개인/사이드 프로젝트 분류. 불필요한 영업 outreach 회피 |
| Educational | △ | 학습 목적이 분명할 때만 |
| Startup | △ | 비즈니스 발전 의도가 분명해진 시점에 prod org만 전환 고려 |
| Agency / Company | ❌ | 1인·소규모 운영에는 과장 |

→ 결정: **prod·beta 모두 Personal**. 추후 prod가 본격 비즈니스화되면 prod org만 Startup으로 전환 검토.

### Project 생성 시 Security 설정 (3가지 옵션)

Project 생성 마법사의 Security 섹션에 다음 3가지 체크박스가 있고, 각각 **보안 default를 결정**한다.

#### 1. Enable Data API

| 항목 | 설명 |
|---|---|
| 무엇 | PostgREST + pg_graphql 기반 자동 REST/GraphQL API의 활성화 여부. `supabase.from('product').select()` 같은 호출이 가는 `/rest/v1/...` 엔드포인트 |
| ON | 정상 작동. supabase-js 클라이언트로 테이블 직접 조회·변경 가능 |
| OFF | REST/GraphQL 엔드포인트 모두 응답 안 함 — GRANT·RLS와 무관하게 차단. supabase-js의 `.from()`·`.rpc()` 모두 불가. 직접 Postgres 연결(service_role 키 또는 Supavisor 풀러)로만 접근 |
| **oshikore-web 권장** | **ON** — Next.js + supabase-js를 쓰는 일반적 패턴에 필수 |

#### 2. Automatically expose new tables

| 항목 | 설명 |
|---|---|
| 무엇 | 새 테이블에 anon·authenticated 역할에게 자동으로 `GRANT`(SELECT/INSERT/UPDATE/DELETE)를 부여할지 여부. **RLS 이전 단계의 GRANT 레이어** |
| ON | 테이블 생성 즉시 PostgREST API로 노출 (RLS가 행 단위 보호) |
| OFF | 새 테이블은 명시적 `GRANT` 없이 API 노출 안 됨. 노출하려면 마이그레이션·SQL Editor에서 `GRANT ... ON public.<table> TO anon, authenticated;` 직접 작성 |
| 정책 변경 이력 | 2026-04-28 OFF 선택지 등장 · **2026-05-30 신규 프로젝트 기본값이 OFF로 전환** |
| **oshikore-web 권장** | **OFF** — *defense in depth*. 의도치 않은 노출 차단 |

#### 3. Enable automatic RLS

| 항목 | 설명 |
|---|---|
| 무엇 | 새 테이블이 자동으로 `ENABLE ROW LEVEL SECURITY` 상태로 생성되는가 |
| ON | 새 테이블 즉시 RLS 활성. 정책이 없으면 **모든 접근 차단**(deny-all). 사용 가능하게 하려면 명시적 `CREATE POLICY` 필요 |
| OFF | 새 테이블은 RLS 비활성 상태로 생성. GRANT만 있으면 anon이 무제한 접근 가능 — **RLS 켜는 걸 깜빡하면 데이터 전체 공개** 클래식 사고 가능 |
| **oshikore-web 권장** | **ON** — 안전을 default로. [`init_catalog.sql:208-217`](../supabase/migrations/20260508132935_init_catalog.sql)이 이미 명시적으로 RLS를 켜지만, 콘솔에서 빠르게 만드는 테이블에도 안전망이 필요 |

#### 보안 모델 = 2계층 (GRANT + RLS)

- **GRANT**: 이 role이 이 테이블에 접근 가능한가? → 없으면 RLS와 무관하게 차단
- **RLS**: 그 role이 어떤 row를 볼 수 있는가? → 정책 기반 행 필터

#### oshikore-web 권장 조합

| 옵션 | 선택 | 이유 |
|---|---|---|
| Enable Data API | **ON** | supabase-js를 통한 클라이언트·서버 사이드 데이터 접근 |
| Automatically expose new tables | **OFF** | 신규 테이블이 의도치 않게 노출되는 사고 방지. 마이그레이션에 GRANT 명시 |
| Enable automatic RLS | **ON** | 새 테이블이 자동으로 안전 상태로 시작 — 정책 누락 시 실패하는 게 *조용한 데이터 유출*보다 나음 |

→ **"엄격한 default, 명시적 노출"** 원칙.

#### 나중에 변경 가능 여부

세 옵션 모두 사후 변경 가능하지만, 적용 범위와 소급 여부가 다르다.

| 옵션 | 변경 위치 | 적용 범위 | 기존 테이블 소급 |
|---|---|---|---|
| Enable Data API | Dashboard > Project Settings > API > "Data API" 토글 | 전체 프로젝트의 REST/GraphQL 엔드포인트 즉시 ON/OFF | ✅ **자동** (켜면 기존 노출 테이블 다시 활성, 끄면 즉시 전체 차단) |
| Automatically expose new tables | SQL: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT/REVOKE ...` | **이후 생성될 테이블**에만 | ❌ **소급 안 됨** — 이미 노출된 테이블은 수동 `REVOKE`, 비노출 테이블은 수동 `GRANT` |
| Enable automatic RLS | SQL로 default 변경 (또는 Dashboard 토글) | **이후 생성될 테이블**에만 | ❌ **소급 안 됨** — 이미 RLS 꺼진 테이블은 수동 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` |

핵심 주의:
- **Data API 토글은 런타임 스위치** — 끄는 즉시 외부 접근 모두 차단. 운영 중 임시로 끄면 서비스 다운으로 직결되므로 신중히
- **Auto-expose · Auto-RLS는 PostgreSQL의 `DEFAULT PRIVILEGES` 디폴트값** — 미래의 `CREATE TABLE`에 어떤 권한·RLS 상태를 적용할지의 *디폴트값*만 바꿈. **이미 만들어진 테이블의 상태는 그대로 남음**. 디폴트만 안전 쪽으로 바꾸고 기존 테이블 점검 안 하면 *디폴트는 안전한데 이미 만들어둔 건 위험* 혼재 상태가 되고, 사고는 그 틈에서 발생
- → **생성 시점에 한 번에 안전한 default를 두는 게 가장 깔끔**

oshikore-web은 마이그레이션에서 RLS·GRANT를 명시적으로 컨트롤하므로 코드상 결정이 우선. 단 콘솔에서 누군가 빠르게 만든 테이블이 default를 그대로 따른다는 점만 인지.

#### 로컬 Supabase 스택의 자동 GRANT (클라우드 토글과 무관 — 함정)

**클라우드에서 "Automatically expose new tables" OFF로 설정해도, `supabase start`로 띄운 로컬 스택은 그와 별개로 `anon`/`authenticated`에게 자동으로 ALL을 부여한다.**

##### 원인

로컬 스택 초기화 시 다음과 유사한 `ALTER DEFAULT PRIVILEGES`가 박혀 있다.

```sql
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
```

→ migration의 `CREATE TABLE` 직후, 작성자가 명시한 `GRANT` 이전에 이미 ALL이 깔려 있다. 즉 `GRANT SELECT TO anon`을 적어도 베이스라인이 ALL이라 **명시 GRANT는 no-op**.

##### 확인 쿼리

```sql
select pg_get_userbyid(defaclrole) as owner,
       n.nspname                   as schema,
       case defaclobjtype when 'r' then 'table' when 'S' then 'sequence'
            when 'f' then 'function' when 'T' then 'type' end as object_type,
       defaclacl                   as default_privileges
from   pg_default_acl
join   pg_namespace n on n.oid = defaclnamespace
where  n.nspname = 'public';
```

`default_privileges`에 `anon=arwdDxt/postgres,authenticated=arwdDxt/postgres`(arwdDxt = ALL on table) 표시가 있으면 자동 GRANT 활성.

##### 영향

| 항목 | 결과 |
|---|---|
| **환경 간 권한 차이** | 로컬: anon=ALL · 클라우드(토글 OFF): anon=nothing → 같은 마이그레이션이 환경마다 다른 권한 분포 생성 |
| **TRUNCATE는 RLS 우회** | RLS 정책은 `TRUNCATE`에 적용 안 됨 — anon이 TRUNCATE 권한을 갖는 건 RLS만 믿기 어렵다는 뜻 |
| **PostgREST에서 즉시 사고는 없음** | PostgREST는 TRUNCATE를 노출하지 않음. Data API 한정으로는 RLS만으로 차단됨. 단 다른 접근 경로(직접 Postgres 연결 등)는 위험 |

##### 대응 — 마이그레이션을 자기완결적으로

마이그레이션에서 `GRANT` 앞에 **`REVOKE ALL FROM anon, authenticated`를 선행**시켜 베이스라인을 비우면, 환경 default와 무관하게 동일한 결과가 나온다.

```sql
-- 베이스라인 초기화 (로컬 자동 GRANT ALL 무력화)
REVOKE ALL ON <tables...> FROM anon, authenticated;

-- 의도한 권한만 명시
GRANT SELECT ON <tables...> TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON <tables...> TO authenticated;
```

이 패턴은 [`init_catalog.sql`](../supabase/migrations/20260508132935_init_catalog.sql)의 GRANT 블록에 적용되어 있다.

##### 핵심 원칙

> **클라우드 콘솔 토글은 클라우드만, 로컬은 스택 초기 스크립트의 default privileges가 별도 결정.**
> 마이그레이션이 *환경별 default*를 가정하면 한 환경에서만 안전한 코드가 된다. **REVOKE 선행 + GRANT 명시**로 마이그레이션 자체가 의도된 권한 분포를 보장하게 만들 것.

출처: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api), [Breaking Change: Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)

### 마이그레이션 운영 전략 (로컬·운영·베타에서 어떻게 적용하는가)

#### 분리해야 할 두 개념

마이그레이션 도구를 쓴다는 것은 두 가지를 의미하는데, 자주 한 덩어리로 묶어 생각해 사고가 난다.

| 개념 | 의미 | 결정 |
|---|---|---|
| **마이그레이션 파일** (단일 진실) | git에 버전 관리되는 DDL 파일 | ✅ 항상 유지. 모든 환경이 같은 SQL을 보게 하는 진실 |
| **자동 실행 도구** (`supabase db push`, `flyway migrate`) | CI/CD에서 도구가 알아서 적용 | 환경마다 다르게 결정. **운영/베타는 수동 적용 권장** |

즉 "마이그레이션 파일을 쓴다 = 자동 실행한다"가 아니다. **파일은 유지하고 적용만 수동**이 가능하다.

#### 운영/베타에서 직접 DDL 실행을 선호하는 이유

실무에서 Flyway/Liquibase를 쓰는 팀도 운영에서는 자동 마이그레이션을 끄고 사람이 직접 SQL을 실행하는 경우가 많다. 이유:

| 이유 | 설명 |
|---|---|
| **변경 검토** | 운영 적용 직전에 `EXPLAIN`·락 영향·데이터량 영향 점검 |
| **타이밍 제어** | 큰 테이블 인덱스 추가는 트래픽 적은 새벽에. 배포 파이프라인에 묶이면 배포와 동시 폭발 |
| **롤백 전략** | 자동 도구는 다 적용/다 실패의 이분법. 부분 적용·수동 복구가 어려움 |
| **장애 격리** | 마이그레이션이 배포에 묶이면 DDL 실패 = 배포 실패 = 다음 코드 변경도 막힘 |
| **감사 로그** | 사람이 실행한 정확한 시각·세션·결과 기록이 명시적으로 남음 |

→ 운영/베타에서 **마이그레이션 파일을 진실로 두되 적용은 수동**으로 하는 패턴이 더 안전.

#### oshikore-web의 마이그레이션 작업 흐름

```
[로컬]                            [git]                  [운영/베타]
─────────────────────             ────                   ──────────────────
supabase migration new ────▶ <파일>.sql ─▶ PR 리뷰 ─▶ merge ─▶ Dashboard SQL Editor
supabase db reset (로컬 검증)                                  │
                                                              │ 복붙 + Run
                                                              ▼
                                                       schema_migrations에
                                                       수동 INSERT (1줄)
```

핵심 규율:
1. **파일은 단일 진실** — git에서 추적, 로컬에서 `supabase db reset`으로 처음부터 재현 가능
2. **운영/베타 적용은 SQL Editor에서 복붙** — 사람의 검토·타이밍·롤백 판단 개입
3. **이력만 1줄로 수동 동기화** — 다음에 누군가 실수로 `supabase db push`를 돌려도 중복 실행되지 않게

#### Dashboard SQL Editor 실전 절차

##### 0. 사전 확인

| 항목 | 확인 위치 |
|---|---|
| 적용 대상 프로젝트 (prod / beta) | https://supabase.com/dashboard 좌측 상단 프로젝트 스위처 |
| "Automatically expose new tables" OFF | Project Settings > API > Data API > 토글 |
| 적용하려는 마이그레이션의 git 파일이 최신 main 기준 | 로컬에서 `git status` clean, `git log -1` 확인 |
| public 스키마 현재 상태 | Table Editor에서 기존 테이블 목록 |

##### 1. SQL Editor 열기

- 좌측 사이드바: **SQL Editor** 아이콘 클릭 (또는 `⌘+K`로 검색)
- URL 패턴: `https://supabase.com/dashboard/project/<ref>/sql/new`
- 우측 상단 **+ New query** 버튼으로 빈 쿼리 시트 생성

##### 2. 마이그레이션 SQL 적용

1. 적용할 마이그레이션 파일(`supabase/migrations/<timestamp>_<name>.sql`) **전체 내용 복사**
2. SQL Editor에 붙여넣기
3. 우측 하단 **Run** (또는 `⌘+Enter`)
4. 결과 패널 확인:
   - 마지막 문이 `CREATE POLICY`/`GRANT` 같은 DDL이면 `Success. No rows returned.`
   - 중간 실패 시 전체 롤백 (한 트랜잭션) — 메시지의 라인 번호로 원인 파악

> ⚠️ **"Run and enable RLS" 팝업은 선택하지 말 것 (예약어 테이블 함정)**
>
> RLS 없는 `CREATE TABLE`이 있으면 실행 직전 SQL Editor가 *"This query creates tables without enabling Row Level Security … Choose whether to enable RLS before running this query"* 팝업을 띄운다. 여기서 **"Run and enable RLS"를 고르면 안 된다.** 이 옵션은 생성되는 테이블마다 `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY`를 자동으로 덧붙이는데:
>
> 1. **예약어 테이블에서 문법 에러.** `order`에 대해 따옴표 없는 `ALTER TABLE order ENABLE ROW LEVEL SECURITY`를 생성 → `ERROR: 42601 syntax error at or near "order"`. 마이그레이션 파일은 `"order"`로 감싸지만 **이 자동 생성 문장은 예약어를 안 감싼다** (그래서 원본 파일엔 없던 라인 번호에서 에러가 남).
> 2. **선택적 RLS 설계와 충돌.** 이 프로젝트는 RLS를 **PII·결제 경계 테이블에만** 명시적으로 켠다([lesson 15](./lessons/15-postgres-roles-and-rls.md)). 자동 옵션은 모든 테이블에 켜므로, 정책 없는 테이블은 `app` 롤 전환 후 deny-all이 된다.
> 3. **불필요.** `anon`/`authenticated`는 마이그레이션의 `REVOKE`로 이미 접근이 막혀 있어, 팝업 경고("anon/authenticated 키로 접근 가능")가 이 프로젝트엔 해당하지 않는다.
>
> → **마이그레이션은 SQL 그대로 실행**(RLS 자동추가 없는 옵션 선택). 필요한 RLS는 마이그레이션이 스스로 정확히 켠다. 팝업 자체가 없는 **`psql -f` / `supabase db push` 경로를 쓰면 애초에 안 겪는다.**
>
> *구별 주의*: 프로젝트 생성 옵션 [Enable automatic RLS](#3-enable-automatic-rls)(미래 `CREATE TABLE`의 DEFAULT PRIVILEGES 디폴트)와, 이 **SQL Editor 실행 팝업의 "Run and enable RLS"**(현재 실행에 `ALTER TABLE … ENABLE RLS`를 덧붙임)는 별개다. 후자만 예약어를 망가뜨린다.
>
> *사례*: 2026-07-14 beta에 `init_order` 적용 중 "Run and enable RLS" 선택 → `LINE 313: ALTER TABLE order ENABLE ROW LEVEL SECURITY` 문법 에러. 옵션 미선택 후 정상 적용.

##### 3. 검증 — 한방 종합 쿼리 재실행

같은 SQL Editor에서 [`§Security 설정 > 보안 모델 = 2계층`](#보안-모델--2계층-grant--rls) 아래의 검증 쿼리를 한 번 더 돌려, 로컬과 동일한 RLS·정책 수·GRANT 분포가 나오는지 확인.

##### 4. 이력 동기화 (필수)

빠뜨리면 차후 `supabase db push`가 같은 SQL을 재실행 → `relation already exists` 오류로 깨짐. 같은 SQL Editor에서 아래를 추가 실행.

```sql
-- 이력 스키마·테이블 보장 (신규 프로젝트는 아직 없을 수 있음)
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
    version    text primary key,
    statements text[],
    name       text
);

-- 적용 기록 (version은 파일명 앞 14자리 타임스탬프, name은 그 뒤 _ 다음 부분)
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('<TIMESTAMP>', '<NAME>', array[]::text[])
on conflict (version) do nothing;
```

##### 5. 최종 동기화 확인 (선택)

로컬에서 CLI로 양쪽 이력이 맞는지 검증.

```bash
supabase link --project-ref <PROJECT_REF>   # 최초 1회
supabase migration list
```

→ LOCAL·REMOTE 칸이 같은 timestamp로 채워져야 OK.

##### 적용 이력 (이 프로젝트)

| 일자 | 환경 | 마이그레이션 | 적용 방법 |
|---|---|---|---|
| 2026-05-18 | beta (또는 prod) | `20260508132935_init_catalog` | Dashboard > Project > SQL Editor 복붙 Run + `schema_migrations` 수동 INSERT |
| 2026-07-14 | beta | `db-reset` 후 `init_catalog`·`init_account`·`init_order` 재적용 | SQL Editor 복붙 Run — **"Run and enable RLS" 미선택**(위 함정 참조) |

> 이후 마이그레이션도 같은 절차로 적용. 환경별로 같은 SQL을 같은 순서로 실행하는 것이 핵심.

#### 운영 적용 후 이력 동기화 SQL

SQL Editor에서 DDL을 실행한 직후, 같은 자리에서 다음을 추가 실행해 마이그레이션 이력 테이블에 적용 기록을 남긴다.

```sql
-- version은 파일명 앞의 14자리 타임스탬프, name은 그 뒤 _ 다음 부분
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260508132935', 'init_catalog', array[]::text[]);
```

이렇게 하면 `supabase migration list`에서 로컬·원격이 같은 상태로 보이고, 차후 push 시 중복 실행으로 인한 `relation already exists` 오류가 발생하지 않는다.

또는 로컬에서:

```bash
supabase migration repair --status applied 20260508132935
```

> ⚠️ **운영에서는 즉흥 DDL 금지** — "운영은 직접 실행"은 *마이그레이션 파일과 1글자도 다르지 않은 SQL*을 실행한다는 뜻이지, SQL Editor에서 즉흥으로 ALTER TABLE을 짜는 것이 아니다. 즉흥 DDL은 git 진실과 운영 실제 스키마 사이에 무성한 drift를 만든다.

#### 적용 방법 비교

| 방법 | 위치 | 이력 자동 기록 | 언제 |
|---|---|---|---|
| **Dashboard SQL Editor + 수동 INSERT** | 웹 콘솔 | ❌ (위 SQL로 수동) | **운영·베타 표준** |
| `supabase db push` | CLI | ✅ | 로컬→리모트 동기화. 자동화가 안전한 환경에서만 |
| `psql` 직접 연결 | 터미널 | ❌ | 스크립팅·반복 적용 시. CI에서는 비권장 |
| `apply_migration` (MCP) | MCP 도구 | ✅ | **사용 금지** — 호출마다 이력 기록되어 로컬 반복 불가. `execute_sql`로 대체 |

#### 언제 자동화(`db push`)로 전환을 고려해야 하나

수동 적용은 규모가 작을 때 유리하지만 다음 신호가 보이면 자동화 검토:

- 환경이 **3개 이상** (dev·staging·prod·preview …) — 사람 손이 누락될 가능성 증가
- 팀이 **5명 이상** — 누가 언제 뭘 적용했는지 추적 비용 폭증
- 마이그레이션이 **단순한 컬럼 추가 위주** — 락·성능 영향이 사실상 없는 환경
- **PR별 preview DB** 도입 (Supabase Branching 등) — preview 환경 수동 적용은 비현실적

지금 oshikore-web은 **1인·MVP 단계**이고 환경은 prod·beta 2개. 수동 적용이 더 합리적.

#### 로컬 작업은 `db push` 그대로

운영/베타만 수동이지, **로컬은 `supabase db reset` + `supabase db push` 그대로 자동화**가 맞다. 로컬은 언제든 폭파해도 무관하므로 도구의 편의성을 최대화.

```bash
# 로컬 DB 폭파 후 모든 마이그레이션 처음부터 재실행
supabase db reset

# 새 마이그레이션 생성
supabase migration new <name>

# 로컬에 적용된 상태와 파일을 비교해 미적용 분만 push
supabase db push
```

출처: [Local development with schema migrations](https://supabase.com/docs/guides/deployment/database-migrations), [supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)

### Egress (월간 outbound 트래픽 — Cached/Uncached 두 라인)

#### 정의

Egress = **Supabase가 클라이언트(인터넷 방향)로 내보내는 모든 outbound 데이터**.
파일을 Supabase로 *올리는* 트래픽(inbound)은 무료이며 카운트되지 않는다.

청구 주기 단위로 측정되며 매월 cycle 시작일에 0으로 리셋 (누적 아님). 다음 cycle 시작일은 콘솔의 **Settings > Usage** 상단에서 확인.

#### Cached vs Uncached — 두 개의 5 GB 별도 한도

Free 플랜의 egress는 한 라인이 아니라 **두 개의 독립 한도**.

| 라인 | Free 한도 | Pro 단가 | 어떤 트래픽 |
|---|---|---|---|
| **Egress** (uncached) | **5 GB / 월** | $0.09 / GB | DB API, Auth, Edge, Realtime, Storage origin 직타 응답 |
| **Cached Egress** | **5 GB / 월 (별도)** | $0.03 / GB | Supabase Storage CDN 엣지 캐시 히트 응답 |

```
[클라이언트] ──── 요청 ────▶ [Supabase CDN 엣지]
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
       ✅ 캐시에 있음 → 엣지가 바로 응답              ❌ 캐시에 없음 → Origin 다녀와서 응답
       → Cached egress 라인 카운트                   → (Uncached) Egress 라인 카운트
```

핵심:
- **합산이 아니라 각각 5 GB** — Free 플랜에서 uncached 4 GB + cached 4 GB는 둘 다 통과(합 8 GB지만 OK). 반대로 cached만 6 GB면 그 라인에서 초과.
- **Cached egress는 사실상 Supabase Storage 전용** — DB·Auth·Realtime은 동적 응답이라 캐싱되지 않음
- **Free CDN 종류**: Basic CDN (단순 TTL 기반). Pro 이상은 Smart CDN (DB 메타데이터 변경 시 엣지 자동 무효화). 두 경우 모두 cached egress 라인은 동일하게 작동.

##### 시나리오별 어디로 잡히는가

| 시나리오 | uncached | cached | Free 통과? |
|---|---|---|---|
| DB API 응답 1 GB + Storage 캐시 히트 4 GB | 1 GB | 4 GB | ✅ 양쪽 < 5 GB |
| Storage origin 직타 4 GB + Storage 캐시 히트 4 GB | 4 GB | 4 GB | ✅ 양쪽 < 5 GB |
| Storage 캐시 히트만 6 GB | 0 | 6 GB | ❌ cached 5 GB 초과 |
| DB 응답만 7 GB | 7 GB | 0 | ❌ uncached 5 GB 초과 |

#### 카운트되는 트래픽

| 출처 | 정확히 무엇이 잡히는가 | 어느 라인 |
|---|---|---|
| **Database** | PostgREST API(`/rest/v1/...`) 응답 본문 — `SELECT` 결과, `INSERT`/`UPDATE` 후 `.select()` 반환 row, RPC 응답 | Uncached |
| **Auth** | 로그인·회원가입·token refresh 응답 (JWT, user 객체, session) | Uncached |
| **Storage (캐시 미스)** | Storage 버킷에서 origin 거쳐 서빙된 파일 | Uncached |
| **Storage (캐시 히트)** | CDN 엣지에 캐시된 파일 응답 | **Cached** |
| **Edge Functions** | 사용자 정의 Edge Function 응답 본문 | Uncached |
| **Realtime** | 구독자에게 푸시되는 메시지 (변경 이벤트, broadcast). 구독자 N명이면 N배로 잡힘 | Uncached |
| **Shared Pooler** | Supavisor 풀러를 거쳐 나가는 쿼리 결과 (DB egress와 중복 방지로 한 쪽만 카운트) | Uncached |
| **Log Drain** | 외부 시스템으로 전송되는 로그 (Pro 이상에서 활성) | Uncached |

#### 카운트되지 않는 트래픽

- **Inbound 트래픽** — 파일 업로드, INSERT/UPDATE 요청 body, Storage put 요청
- **Supabase를 거치지 않는 외부 서비스의 egress**
  - **Cloudflare R2 → 클라이언트** 트래픽은 Supabase egress에 잡히지 않음 ← oshikore-web에서 가장 중요한 포인트. 무거운 이미지 트래픽이 Supabase egress 부담에서 빠진다는 뜻
  - Vercel CDN을 거치는 정적 자산 (Next.js 빌드 산출물 등)
  - 외부 SMTP를 직접 호출하는 트래픽

#### 측정 방식

- **단위**: GB (네트워크 레이어 raw bytes 추정; 압축 후·헤더 포함 여부는 공식 명시 없음)
- **두 라인 독립 집계** — Storage CDN 히트는 cached 라인, 그 외 모든 outbound는 uncached 라인
- **리셋 주기**: 월(청구 주기). 사용량 계열의 다른 한도들과 같은 룰
  - **월 리셋**: Egress(둘 다), MAU, Edge Functions 호출, Realtime 메시지
  - **누적(시점)**: DB 용량 500 MB, Storage 용량 1 GB (직접 데이터를 지우지 않으면 안 줄어듦)

#### 한도 초과 동작

| 플랜 | Uncached 한도 | Cached 한도 | 초과 시 |
|---|---|---|---|
| **Free** | 5 GB / 월 | 5 GB / 월 | 즉시 차단되지 않음 → 알림 발송 + grace period (Fair Use Policy) → 미해소 시 제한 |
| **Pro** | 250 GB / 월, 이후 $0.09/GB | 250 GB / 월, 이후 $0.03/GB | 초과분 자동 과금 (Spend Cap 비활성화 기준) |

#### oshikore-web 트래픽 시뮬레이션 (월 200 활성 사용자 가정)

이미지는 R2가 받아내므로 Supabase egress는 PostgREST·Auth·Realtime만 부담.
**Cached egress 라인은 사실상 0** (Supabase Storage를 안 쓰므로). 아래는 uncached 5 GB 한도에 대한 분석.

| 행동 | 사용자당 횟수/월 | 응답 크기 | 사용자당 월 egress |
|---|---|---|---|
| 상품 목록 조회 (20개) | 30 | ~20 KB | 600 KB |
| 상품 상세 조회 | 20 | ~4 KB | 80 KB |
| Token refresh (1시간 TTL × 활성 시간) | ~90 | ~2.5 KB | 225 KB |
| 로그인 | 10 | ~4 KB | 40 KB |
| **사용자 1명당 합계** | | | **~950 KB / 월** |
| × 200 사용자 | | | **~190 MB / 월** |
| + 어드민·봇·미디어 메타 (여유 5×) | | | **~1 GB / 월** |

→ Free 5 GB의 **~20 %** 수준. 이 규모에선 여유.

#### 5 GB를 빠르게 갉아먹는 안티패턴

| 패턴 | 왜 위험한가 |
|---|---|
| **목록에서 `*` 셀렉트** | 매번 description·JSONB 등 무거운 컬럼까지 같이 나감 |
| **클라이언트 폴링 (`setInterval` 반복 fetch)** | 동일 데이터를 N배로 받음. Realtime이나 SWR/React Query 캐시로 대체 |
| **INSERT/UPDATE 후 `.select()` 자동 반환** | id만 필요한데 row 전체를 돌려받음 |
| **이미지를 Supabase Storage에 두고 CDN으로 서빙** | 무거운 트래픽이 5 GB 직격. R2로 빼야 함 |
| **Realtime payload에 row 전체** | 구독자 N명에 같은 데이터가 N배로 빠짐. 필요한 필드만 broadcast |
| **클라이언트에서 `pg_dump` / 대량 export** | 한 번에 수백 MB 빠짐. 백업은 서버 사이드 작업으로 |
| **이미지 base64를 DB에 저장 → 조회 시 같이 반환** | 한 응답에 수 MB. 이미지는 R2 키만 저장 |
| **N+1 쿼리 패턴** | 응답마다 헤더·메타데이터 오버헤드가 누적 |

#### Egress 줄이는 실용적 방법

1. **필요한 컬럼만 명시** — `.select('id, name, sale_price')`. 특히 목록 화면
2. **mutation 응답 최소화** — `.select()` 생략하거나 필요한 컬럼만 지정
3. **클라이언트 캐싱** — React Query·SWR의 stale-while-revalidate로 같은 데이터 재요청 차단
4. **이미지·동영상은 R2 + Cloudflare CDN** — Supabase Storage egress 우회
5. **Realtime payload는 최소화** — `payload.new` 전체를 그대로 흘리지 말고 필요한 필드만 broadcast
6. **페이지네이션 강제** — `range()` 또는 cursor 기반으로 한 번에 받는 양 제한
7. **응답 압축 확인** — Supabase는 gzip을 자동 적용하지만 클라이언트가 `Accept-Encoding`을 보내는지 확인
8. **목록과 상세 분리** — 목록은 요약 필드만, 상세는 별도 호출. 처음부터 전체 페이로드를 받지 않음
9. **콘솔 Reports > Database/API 페이지**에서 응답 크기 큰 엔드포인트를 정기 점검

### Storage 1 GB (파일 저장 용량)

#### 정의

Supabase Storage = S3/R2와 같은 종류의 **객체 스토리지**. 파일을 bucket이라는 컨테이너에 보관한다. Free 플랜 1 GB는 **모든 버킷에 올린 파일의 raw 바이트 총합** 한도.

- DB 500 MB와는 **완전히 별개**의 라인
- 누적 시점 기준 — 월 리셋 아님. 직접 지우지 않으면 줄어들지 않음

#### 측정 방식 — GB-Hours

Supabase는 단순 "현재 GB"가 아니라 **GB-Hours**(시간 적분) 단위로 측정한다.

> **1 GB-Hour = 1 GB를 1시간 동안 저장한 상태**

| 한 달 동안의 보관 상태 | GB-Hours 계산 | 결과 |
|---|---|---|
| 1 GB × 30일 (744시간) | 1 × 744 | 744 GB-Hr |
| 0.5 GB × 30일 | 0.5 × 744 | 372 GB-Hr |
| 첫 15일 비움 + 다음 15일 1 GB | 1 × 372 | 372 GB-Hr |
| 1주 동안만 1 GB 보관 후 삭제 | 1 × 168 | 168 GB-Hr |

Free 한도 = **744 GB-Hr / 월** (= 1 GB × 30일). 잠깐 올렸다 지우면 그만큼 적게 잡힘 → 임시 파일 패턴엔 유리.

#### 카운트되는 것

| 항목 | 카운트 |
|---|---|
| Storage 버킷에 업로드된 파일의 raw 바이트 (`storage.objects.metadata->>'size'`) | ✅ |
| 종류 무관 — 이미지·동영상·PDF·zip 등 | ✅ |
| 같은 파일을 여러 버킷에 복제 | ✅ (각각 따로 카운트) |
| 파일 metadata 자체 (DB의 `storage.objects` row) | ❌ — DB 500 MB로 잡힘 (소량) |
| Bucket 자체 (빈 버킷 생성) | ❌ |

#### 카운트되지 않는 것

- **Supabase 외부 스토리지** — Cloudflare R2·S3 등에 직접 업로드한 파일은 무관
- **DB 안의 `BYTEA`·`JSONB` 바이너리** — 이건 DB 500 MB 한도에 잡힘
- **inbound 업로드 트래픽 자체** — 업로드 행위는 무료. 저장된 파일이 그때부터 GB-Hr로 누적

#### 파일당 크기 제한

| 플랜 | 1 파일 최대 |
|---|---|
| **Free** | **50 MB** |
| Pro | 50 GB |

→ Free에서는 50 MB 넘는 파일은 업로드 자체가 차단. 고해상도 동영상·원본 RAW 등 큰 파일은 R2 같은 외부 스토리지로 보내야 함.

#### 한도 초과 동작

| 플랜 | 한도 | 초과 시 |
|---|---|---|
| **Free** | 1 GB (744 GB-Hr / 월) | 알림 + grace period → 미해소 시 신규 업로드 차단 가능 |
| **Pro** | 100 GB 포함, 이후 $0.021/GB·월 | 초과분 자동 과금 (Spend Cap 비활성화 기준) |

#### oshikore-web 관점 — R2 우회로 사실상 0

이 프로젝트는 상품 사진을 **Cloudflare R2에 직접 업로드**하고 DB의 `product_photo.r2_key`에는 R2 객체 키만 저장하는 구조다 ([`init_catalog.sql:163-188`](../supabase/migrations/20260508132935_init_catalog.sql)).

→ **Supabase Storage 사용량 = 0**. 1 GB 한도는 사실상 잉여.

R2 우회의 누적 이점:

| 항목 | R2 우회 시 |
|---|---|
| Storage 1 GB 한도 부담 | 0 |
| Cached egress 5 GB 한도 부담 | 0 |
| Storage 50 MB 파일 크기 제한 | 회피 |
| 외부 트래픽 비용 | R2 egress 무료 → 0 |

#### 향후 Supabase Storage가 의미를 가지는 시나리오

| 시나리오 | 적합성 | 이유 |
|---|---|---|
| 어드민 전용 첨부파일 (송장·매입증빙·계약서) | ✅ | RLS로 admin만 접근 제한이 쉬움. Auth·DB와 같은 권한 모델 |
| 사용자 프로필 아바타 | ✅ | Auth와 자연스럽게 연동, RLS로 본인만 수정 |
| 임시 export·백업 파일 (CSV 등) | △ | 한도 잡아먹기 쉬움. GB-Hr 특성상 단기 보관이면 부담 작음 |
| 공개 상품 이미지 | ❌ | R2가 비용·CDN·확장성에서 우위. egress 부담도 큼 |
| 대용량 동영상·RAW 원본 | ❌ | 50 MB 파일 제한에 막힘 |

#### 측정 방법

콘솔: **Reports > Storage** 또는 **Settings > Usage** 에서 현재 사용량과 GB-Hours 추이 확인.

SQL로 직접 측정:

```sql
-- 버킷별 사용량
SELECT
  bucket_id,
  COUNT(*) AS files,
  pg_size_pretty(SUM((metadata->>'size')::bigint)) AS total_size
FROM storage.objects
GROUP BY bucket_id
ORDER BY SUM((metadata->>'size')::bigint) DESC;

-- 큰 파일 상위 20개
SELECT
  bucket_id,
  name,
  pg_size_pretty((metadata->>'size')::bigint) AS size,
  created_at
FROM storage.objects
ORDER BY (metadata->>'size')::bigint DESC
LIMIT 20;
```

### 한도 초과 시 동작

- **Free 플랜 또는 Spend Cap 활성화**: 즉시 차단되지 않음. 알림이 발송되고 **grace period** 동안 유예. 그래도 줄어들지 않으면 제한.
- **Pro 플랜 + Spend Cap 비활성화**: 초과분에 대해 자동 과금.

출처: [Manage Monthly Active Users usage](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users)

---

## 참고: oshikore-web 규모에서의 용량 추정

무료 500 MB 한도가 oshikore-web 실제 도메인에서 얼마나 여유 있는지 감각을 잡기 위한 시뮬레이션. 컬럼 정의는 [`supabase/migrations/20260508132935_init_catalog.sql`](../supabase/migrations/20260508132935_init_catalog.sql)을 기준으로 했고, 주문(`order`/`order_item`)은 스키마 미정이라 일반적인 e-commerce 구조를 가정했다.

### 입력 시나리오

| 항목 | 수치 | 매핑 |
|---|---|---|
| 유저 | 200 | `auth.users` (Supabase Auth) |
| 그룹 | 10 | `team` |
| 멤버 | 200 | `member` |
| 멤버-팀 활동 이력 | ~300 (멤버당 1.5건 가정) | `team_member` |
| 상품 | 1,000 | `product` |
| 상품 사진 | ~3,000 (상품당 3장 가정) | `product_photo` |
| 주문 | 5,000 | `order` (스키마 미존재 — 가정치) |
| 주문 라인 | ~10,000 (주문당 2건 가정) | `order_item` (가정) |

### 테이블별 추정

행 헤더(~24 B) + 컬럼 데이터 + 인덱스 합산. UTF-8 한글 1자 ≈ 3 B.

| 테이블 | 1행 크기 | 행 수 | 데이터 | 인덱스 | 소계 |
|---|---|---|---|---|---|
| `team` | ~250 B | 10 | 2.5 KB | 0.3 KB | ~3 KB |
| `member` | ~250 B | 200 | 50 KB | 6 KB | ~56 KB |
| `team_member` | ~150 B | 300 | 45 KB | 24 KB | ~70 KB (인덱스 3개) |
| `product` | ~700 B | 1,000 | 700 KB | 250 KB | ~950 KB (인덱스 8개) |
| `product_photo` | ~260 B | 3,000 | 790 KB | 100 KB | ~890 KB |
| `auth.*` (auth.users 외 sessions/tokens 포함) | ~1.5 KB | 200 | 300 KB | 200 KB | ~500 KB |
| `order` (가정) | ~630 B | 5,000 | 3.1 MB | 0.4 MB | ~3.5 MB |
| `order_item` (가정) | ~200 B | 10,000 | 2.0 MB | 0.5 MB | ~2.5 MB |
| **도메인 데이터 합계** | | | | | **~8.5 MB** |

### Postgres 시스템 오버헤드

| 항목 | 추정 |
|---|---|
| 시스템 카탈로그 (`pg_catalog`) | ~10 MB |
| WAL (활성, 체크포인트 직전이 큼) | ~16–64 MB |
| Vacuum 전 dead tuples (정상 트래픽) | ~10–30 MB |
| `auth`/`storage` 확장 스키마 자체 | ~10 MB |
| **합계** | **~50–100 MB** |

### 총 사용량

| | 일반 | 보수적 (description 길고 JSONB 다국어 풍부) |
|---|---|---|
| 도메인 데이터 | ~9 MB | ~15 MB |
| 시스템 오버헤드 | ~50 MB | ~100 MB |
| **합계** | **~60 MB** | **~115 MB** |
| **500 MB 대비** | **~12 %** | **~23 %** |

→ 이 규모는 무료 한도의 **약 10~25 %** 만 사용. 같은 비율 확장 시 **상품 4,000~8,000개 + 주문 20,000~40,000건** 까지가 500 MB 안에서의 안전 운영 한계 추정.

### 이 추정을 깨뜨릴 수 있는 변수

1. **`product.description`이 1 KB 이상**으로 길어지면 → 상품 1,000개 기준 데이터가 2배 (가장 큰 변동 요인).
2. **`name_i18n` JSONB에 많은 언어** 추가 시 (KR/JP 외 10개 언어 풀이면 한 행 +500 B).
3. **상품당 사진 메타가 5~10장**으로 증가 → `product_photo` 데이터 2~3배.
4. **audit/event 로그 테이블 도입** → 도메인 데이터보다 누적 속도가 빠르므로 별도 시스템(R2 JSONL, 외부 로깅)으로 분리 권장.
5. **soft-delete 잔존 row 누적** — 정리 정책 없이 `deleted_at`만 두면 데드 무게로 쌓임.

### 측정 방법 (실데이터 발생 후)

추정이 아니라 실제 값을 보고 싶으면:

```sql
-- 전체 DB 크기
SELECT pg_size_pretty(pg_database_size(current_database()));

-- 테이블별 (데이터 + 인덱스 + TOAST)
SELECT
  schemaname || '.' || relname AS table,
  pg_size_pretty(pg_total_relation_size(relid)) AS total,
  pg_size_pretty(pg_relation_size(relid))       AS data_only,
  pg_size_pretty(pg_indexes_size(relid))        AS indexes
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

Supabase 콘솔에서는 **Reports > Database** 또는 **Settings > Usage** 에서도 현재 사용량 확인 가능.

---

## 참고: 대규모 RDS Aurora 클러스터 사례

Supabase 무료 플랜의 규모 감각을 잡기 위한 참고 데이터. 다른 실서비스(자사 아님)의 운영 중인 Aurora 클러스터를 살펴본 결과를 기록한다.

### 사례 요약

| 항목 | 값 |
|---|---|
| 엔진 | Amazon Aurora (RDS 클러스터) |
| DB 인스턴스 클래스 | `db.r6g.2xlarge` (8 vCPU, 64 GiB RAM) |
| 클러스터 스토리지 구성 | Aurora Standard |
| 용량 유형 | 프로비저닝됨 (Provisioned) — Serverless 아님 |
| `VolumeBytesUsed` | **7.45 TB** |

### Supabase 무료 한도와의 규모 차이

| 기준 | 한도 | 사례 7.45 TB 대비 |
|---|---|---|
| Supabase Free DB | 500 MB | 약 15,000배 |
| Supabase Pro 포함 DB | 8 GB | 약 930배 |

→ 무료 플랜의 500 MB는 "**프로토타입 또는 beta용 샘플 데이터**" 규모이지, 실서비스의 풀 데이터셋과 비교할 척도가 아니라는 점을 보여주는 데이터 포인트.

### 어떻게 조회했는가

RDS는 컴퓨팅(인스턴스 클래스)과 스토리지(타입·사용량)가 **별도 설정**이라 각각 다른 위치에서 확인해야 한다.

#### 1) 인스턴스 클래스 (CPU·RAM·네트워크)

- 위치: **RDS Console > Databases > [DB 인스턴스 행] > Configuration 탭**
- 보이는 항목: "Instance class" 필드 (예: `db.r6g.2xlarge`)
- 이름 해석: `db.<family><generation><variant>.<size>`
  - `r6g` = 6세대 메모리 최적화 + Graviton2 (ARM)
  - `2xlarge` = large 대비 4배 → 8 vCPU / 64 GiB RAM
- 클래스 사양 레퍼런스: [Hardware specifications for DB instance classes](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.Summary.html)

#### 2) 클러스터 스토리지 타입 (Standard vs I/O-Optimized)

- 위치: **RDS Console > Databases > [클러스터 이름] > Configuration 탭** (인스턴스 행이 아니라 그 부모 클러스터 행)
- 보이는 항목: "Storage type" 필드
- Aurora 값: `aurora` (Standard) / `aurora-iopt1` (I/O-Optimized)
- CLI:
  ```bash
  aws rds describe-db-clusters \
    --db-cluster-identifier <cluster-name> \
    --query 'DBClusters[0].StorageType'
  ```

#### 3) 용량 유형 (Provisioned vs Serverless)

- 위치: 같은 Configuration 탭의 "Capacity type" 필드
- 값: `provisioned` / `serverless`
- Provisioned는 고정 인스턴스가 24시간 풀가동, Serverless v2는 ACU 단위 자동 스케일

#### 4) 현재 사용 중인 스토리지 크기

Aurora는 사용량 기반 자동 증가 모델이라 "할당량" 개념이 없다. 청구의 기준은 **`VolumeBytesUsed`** CloudWatch 지표.

- **콘솔**: RDS Console > Databases > [클러스터 이름] > Monitoring 탭 → `VolumeBytesUsed` 그래프 (단위 bytes, GB로 환산 시 ÷ 1,073,741,824)
- **CLI**:
  ```bash
  aws cloudwatch get-metric-statistics \
    --namespace AWS/RDS \
    --metric-name VolumeBytesUsed \
    --dimensions Name=DBClusterIdentifier,Value=<cluster-name> \
    --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 3600 \
    --statistics Average \
    --query 'Datapoints[0].Average' \
    --output text
  ```
- **SQL (논리 breakdown)**: `VolumeBytesUsed`는 인덱스·WAL·bloat 포함 물리 사용량이고, 어떤 테이블이 차지하는지는 별도 SQL로만 확인.
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database())); -- 논리적 DB 크기
  SELECT schemaname || '.' || relname AS table,
         pg_size_pretty(pg_total_relation_size(relid)) AS total
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 20;
  ```
- 참고: [View storage use for your Amazon Aurora cluster](https://repost.aws/knowledge-center/view-storage-aurora-cluster)

### Aurora ↔ Supabase 스토리지 모델 비교

| 축 | RDS Aurora | Supabase |
|---|---|---|
| 컴퓨팅과 스토리지 결합 | **분리** — 인스턴스 클래스와 disk가 독립적으로 설정·청구 | **묶음** — 플랜 단위로 RAM·DB 용량이 함께 책정 |
| 스토리지 사전 할당 | Aurora는 자동 증가 (사전 할당 없음) / 일반 RDS는 GB 할당 | 플랜별 포함 용량 + 초과분 add-on |
| 청구 단위 | GB·월 + I/O 요청 (Standard) | 플랜 + 초과 GB·월 |
| 사용량 조회 | CloudWatch `VolumeBytesUsed` (물리) + `pg_database_size()` (논리) | 콘솔 Usage 페이지 + `pg_database_size()` |

---

## 참고 자료

- [Supabase Pricing](https://supabase.com/pricing) — 전체 플랜별 한도 일람
- [Manage Monthly Active Users usage](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users) — MAU 정의 및 카운팅
- [Manage Monthly Active Third-Party Users usage](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-third-party) — Third-Party MAU
- [Manage Edge Function Invocations usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations) — Edge Functions 호출 수 한도
- [Manage Egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress) — Egress 정의·카운트 대상·줄이는 방법
- [Manage Storage Size usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size) — Storage size GB-Hours 측정·청구 방식
- [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) — 한도 적용 단위 (account / organization / project)
- [Keeping your 2 Free projects after upgrading to Pro](https://supabase.com/docs/guides/troubleshooting/keeping-free-projects-after-pro-upgrade-Kf9Xm2) — Pro 업그레이드 후에도 별도 Free org에 무료 프로젝트 2개 유지 가능
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — Data API / GRANT / RLS 2계층 보안 모델
- [Breaking Change: Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) — 2026-05-30부터 신규 프로젝트 기본값이 "노출 안 함"으로 전환
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — RLS 기본 개념과 정책 작성
- [Edge Functions Limits](https://supabase.com/docs/guides/functions/limits) — Edge Functions 실행 제약 (메모리, 실행시간 등)
- [Local development with schema migrations](https://supabase.com/docs/guides/deployment/database-migrations) — 마이그레이션 파일 작성·적용 흐름
- [supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) — 수동 적용 후 이력 동기화 CLI

---

## 변경 이력

- 2026-05-17 — 최초 작성: 무료 플랜 할당량 정리
- 2026-05-17 — "참고: 대규모 RDS Aurora 클러스터 사례" 섹션 추가 (7.45 TB 사례 + 스토리지/스펙 조회 방법)
- 2026-05-17 — "참고: oshikore-web 규모에서의 용량 추정" 섹션 추가 (유저 200/그룹 10/멤버 200/상품 1,000/주문 5,000 시나리오 ≈ 무료 한도의 10~25%)
- 2026-05-17 — Egress 5 GB 섹션 보강: 카운트 대상/제외 트래픽, 측정 방식(월 리셋·cached/uncached), 200 사용자 시나리오, 안티패턴, 줄이는 방법
- 2026-05-17 — Egress 섹션을 "Cached 5 GB + Uncached 5 GB 별도 한도" 구조로 재정리. 한눈에 보기 표도 두 라인으로 분리. Pro 단가($0.09 vs $0.03/GB) 명시.
- 2026-05-17 — Storage 1 GB 섹션 신규 추가: GB-Hours 측정 방식, 카운트 대상/제외, 50 MB 파일 제한, R2 우회 이점, 측정 SQL. 한눈에 보기 표의 중복 라인 제거(Storage cached egress).
- 2026-05-17 — Project 한도 섹션 정정·보강: "free project 2개는 organization 당"이라는 오기를 **"계정(account) 전체에서 2개"** 로 정정. 한도별 적용 단위 매트릭스(account/organization/project) 추가. prod/beta 분리 배치 시 사용량 한도 독립 효과 명시.
- 2026-05-17 — Organization 생성 시 "Type" 필드 안내 추가: Free 플랜 사용량·과금에 영향 없는 분류 필드. prod·beta 모두 Personal 권장.
- 2026-05-17 — Project 생성 시 Security 설정 3가지 옵션 섹션 신규 추가 (Enable Data API · Automatically expose new tables · Enable automatic RLS): 각 옵션 정의·동작·권장, GRANT+RLS 2계층 보안 모델, oshikore-web 권장 조합(ON/OFF/ON), 사후 변경 가능 여부와 소급 적용 한계.
- 2026-05-18 — "마이그레이션 운영 전략" 섹션 신규 추가: 파일(단일 진실) vs 자동 실행 도구 분리, 운영/베타는 SQL Editor 수동 적용 + `schema_migrations` 1줄 INSERT로 이력 동기화, 로컬은 `db reset`/`db push` 자동화 유지. 즉흥 DDL 금지·자동화 전환 신호 명시.
- 2026-05-18 — "로컬 Supabase 스택의 자동 GRANT" 함정 섹션 신규 추가: 클라우드 토글 OFF여도 로컬은 `ALTER DEFAULT PRIVILEGES`로 anon/authenticated에 ALL 자동 부여 → 환경 간 권한 차이·TRUNCATE는 RLS 우회. 대응으로 마이그레이션에 `REVOKE ALL FROM anon, authenticated` 선행 + 의도한 GRANT 명시 패턴 명문화.
- 2026-05-18 — "Dashboard SQL Editor 실전 절차" 서브섹션 신규 추가: 사전 확인 → SQL Editor 경로(좌측 사이드바 또는 `/sql/new` URL) → 마이그레이션 복붙 Run → 검증 쿼리 재실행 → `schema_migrations` 수동 INSERT → `supabase migration list`로 최종 확인. "적용 이력" 표에 `20260508132935_init_catalog` 클라우드 첫 적용 기록.
- 2026-07-14 — "Dashboard SQL Editor 실전 절차"에 **"Run and enable RLS" 팝업 함정** 경고 추가: 자동 옵션이 예약어 테이블(`order`)에 따옴표 없는 `ALTER TABLE order ENABLE RLS`를 생성해 `42601` 문법 에러 유발 + 선택적 RLS 설계와 충돌 → 마이그레이션은 RLS 자동추가 없이 실행(또는 `psql -f`). "적용 이력"에 2026-07-14 beta 재적용 기록 추가.
