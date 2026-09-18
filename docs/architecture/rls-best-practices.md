# RLS 베스트프랙티스 (찬반 근거 + 정책 작성 규칙)

> Row-Level Security를 **쓸지 / 어떻게 쓸지**의 단일 진실.
> **현재 결론: 쓰지 않는다**(2026-08-01 변경) — 근거는 [db-authorization-review.md](./db-authorization-review.md).
> RLS *운영*(활성화 기본·마이그레이션 포함)은 [auth-and-data.md](./auth-and-data.md),
> 스키마 *모양*은 [data-modeling.md](./data-modeling.md). 여기서는 **찬반 근거 + 정책 작성 규칙**만 다룬다.

## 결론 (이 프로젝트) — 2026-08-01 변경

**RLS를 쓰지 않는다.** 인가는 앱 DAL(Server Action의 `requireAdmin`·`requireAccount`)로 단일화하고,
DB 방어선은 **GRANT 매트릭스**(비특권 `app` 롤)가 담당한다.

```
인가 판정   앱 DAL 단일화
DB 방어선   GRANT (soft delete 강제, 컬럼 제한 UPDATE, TRUNCATE 미부여)
```

근거 원본은 [db-authorization-review.md](./db-authorization-review.md). 핵심만 옮기면:

1. **RLS의 최대 명분이 해당하지 않는다** — 아래 CVE-2025-48757은 *Data API에 노출된* 테이블의 위험인데,
   이 프로젝트는 Data API를 쓰지 않는다(테이블 쿼리 0건, 인증도 자체 구현). 실측으로 확인됨.
2. **부분 유지가 불가능하다** — `app` 롤은 `rolbypassrls=false`라 전환 시 RLS가 살아난다.
   GUC 미주입이면 fail-closed로 전 조회가 0행이 되므로, 테이블마다 "제거 or GUC 주입" 택일이다.
   경계 데이터만 남기는 절충은 GUC 작업 비용을 그대로 떠안는다.
3. **방어 독립성** — RLS가 막는 건 "앱 DAL이 뚫렸을 때"인데 GUC를 주입하는 주체가 그 앱 DAL이다.
   GRANT는 앱이 바꿀 수 없어 독립적이다.

> **되돌릴 수 있다.** 정책 SQL은 git 히스토리에 있고 소유키(`account_id`)는 테이블에 잔존한다.
> 경계 판단이 바뀌면 정책 재작성 + `ENABLE`로 복구 — 스키마·Prisma 변경 불필요.
> **아래 리서치와 정책 작성 규칙은 그 재도입에 대비해 보존한다.**

<details>
<summary>이전 결론 (2026-06~07) — 참고용</summary>

> **RLS를 유지한다 — 단, 전면이 아니라 경계 데이터에.** 우리는 Supabase + (잠재적) Data API 노출 맥락이라, RLS-off의 가장 강력한 실증인 **CVE-2025-48757**(정책 없는 노출 테이블이 anon 키만으로 대량 유출, CVSS 9.3 Critical, 170개 프로젝트·303개 엔드포인트)이 **정확히 우리 위험 클래스**다. 단, RLS는 **보조 안전망(backstop)**이고 1차 권한은 Server Action/DAL이 담당한다 ([auth-and-data.md](./auth-and-data.md)). **적용 범위는 노출 스키마·경계 데이터(PII·결제)에 한정**하고, 그 외 도메인 테이블은 도메인 관점으로 RLS 여부를 판단한다(아래 [RLS를 어디에 걸까] 절).

**무엇이 틀렸나**: 논리가 아니라 **전제**다. "(잠재적) Data API 노출"의 *잠재적*이 코드 수준에서
성립하지 않음이 2026-08-01 실측으로 확인됐다. 같은 문서가 이 경우의 기준도 이미 적어뒀다 —
"Data API에서 REVOKE된 테이블의 RLS는 app 롤 앱-버그 대비 backstop일 뿐"이다.

</details>

## 커뮤니티 찬반 요약 (리서치)

| 진영 | 핵심 주장 | 대표 출처 |
|---|---|---|
| **권장** | 쿼리 방식과 무관하게 일관 강제, defense-in-depth, 노출 스키마 필수 | Supabase·PostgreSQL 공식 문서, CVE-2025-48757(NVD) |
| **신중/반대** | 보안 로직을 DB로 옮김(디버깅·풀링·조용한 실패), 성능 | PlanetScale, postgres.fm, Bytebase |
| **중도** | RLS는 필요하나 불충분 → 앱 인가와 계층 결합 | Permit.io, Bytebase |

**합의된 사실** (반대 진영도 메커니즘 자체는 인정):
1. 노출 스키마에서 RLS-off-by-default는 실제로 위험하다 (CVE 실증).
2. STABLE 인증 함수(`auth.uid()`/`current_setting()`)의 **행별 재평가는 실재하는 성능 문제** → **`(select …)` 래핑이 사실상 표준 해법** (옵티마이저가 InitPlan으로 쿼리당 1회 평가; 단순 케이스 ~20배, 함수가 행마다 조인하는 극단 케이스 ~1.4만 배 개선).
3. null 비교의 "조용한 0행"은 디버깅 함정 (단, 우리 backstop에선 의도된 fail-closed).
4. superuser/owner 우회는 실재 → `FORCE RLS`/롤 설계가 필요.

> ⚠️ 출처 무게는 비대칭이다. 반대 진영 출처 다수가 이해상충 벤더(DB 경쟁사·인가/거버넌스 도구 판매)이고, 그들의 구체적 기술 주장 상당수(정책 소스 drift·시나리오 단위테스트 불가·DBA 병목·보안뷰 predicate pushdown 우위·다중정책 행별 반복평가)는 적대적 검증에서 **기각**됐다. 살아남은 건 정성적 운영 신중론이며, 권장 진영(공식 문서·CVE)보다 실증이 약하다.

## 이 프로젝트의 정책 작성 규칙

> 🗄️ **현재 미적용.** RLS를 쓰지 않기로 했으므로(위 결론) 아래는 **재도입 시 참조할 규칙**이다.
> 지우지 않는 이유: 판단 기준과 성능 함정(`(select …)` 래핑)은 되살릴 때 다시 조사할 필요가 없다.

### RLS를 어디에 걸까 — 경계 데이터 기준

> **결정 규칙**: 테이블이 **경계 데이터**(PII·결제/금융 등 민감·규제 대상)인가로 RLS 여부를 가른다.
> 경계 데이터가 아니면 RLS를 기본 적용하지 말고 **도메인 관점**에서 결정한다 — 대개 앱 DAL 인가로 충분하고, 스키마는 도메인-순수(소유는 집합 루트에서 도출)로 둔다.

- **경계 데이터 → RLS backstop 유지**. 노출 여부와 무관하게 심층방어. 예: `order_address`(PII)·`payment`(결제). 소유키(`account_id`)를 그 테이블에 두고 단순 owner 정책.
- **경계 데이터 아님 → 도메인 관점으로 결정(기본 미적용)**. 소유권은 부모(`order_id` 등)로 도출되므로, RLS 편의를 위해 `account_id`를 자식마다 비정규화하지 않는다(스키마가 infra에 물들지 않게). 1차·유일 가드는 앱 DAL. 예: `order_item`·`order_status_history`.
- **왜 노출 테이블과 다른가**: RLS의 가장 센 명분(CVE-2025-48757 = Data API 대량유출)은 `anon`/`authenticated`에 **노출된 스키마**에만 걸린다. Data API에서 `REVOKE`된 테이블(order 도메인 등)의 RLS는 *app 롤 앱-버그 대비 backstop*일 뿐이라, 경계 데이터가 아니면 그 값이 도메인-순수성 비용을 넘지 못한다.
- **제거 용이성**: 경계 판단이 바뀌면 정책 `DROP` + `DISABLE`만으로 즉시 해제(메타데이터 연산). `account_id`는 앱 필터용으로 잔존 가능 → 스키마·Prisma 변경 불필요.

### ✅ 규칙
1. **정책은 단순하게**: `true`, `col = (select current_account_id())`, `(select is_admin())`, 그리고 이들의 OR/AND 조합만 쓴다. 인가 *로직*(OAuth·세션 검증·권한 판정)은 앱(DAL)에 두고, 정책은 **소유자/롤 한 줄 체크**만 한다. 정책 안에서 다른 테이블 조인·서브쿼리·비즈니스 규칙은 금지.
2. **세션 의존 함수는 `(select …)`로 래핑**: `current_account_id()`/`is_admin()`은 `current_setting()`을 읽는 STABLE 함수라, 미-래핑 시 스캔 행마다 재호출된다. `account_id = (select current_account_id())`처럼 감싸 InitPlan(쿼리당 1회)으로 만든다. (Supabase 린트 `0003_auth_rls_initplan` 대응.) 단, 함수 결과가 행 데이터에 의존하지 않을 때만 유효 — 우리 GUC 함수는 행과 무관하므로 안전.
3. **fail-closed by design**: GUC 미설정 시 `(select current_account_id())`가 NULL → `col = NULL` → 0행. 의도된 동작이라 별도 `IS NOT NULL` 가드는 두지 않는다(디버깅 시 "왜 0행"이 RLS 때문일 수 있음만 인지).
4. **owner 우회 인지**: 현재 Prisma는 owner(postgres) 롤로 접속해 **RLS를 우회**한다(운영 편의). 실 가동 시 `app` 롤 전환 또는 `FORCE ROW LEVEL SECURITY`로 백스톱을 실제 활성화한다. 그 전까지 1차 가드는 전적으로 Server Action.
5. **컬럼 단위는 RLS로 못 막는다**: 소유자가 본인 행의 민감 컬럼(`status`·금액)을 위조하는 것은 RLS가 막지 못한다. 그 가드는 Server Action이며, 실 PG 결제 승인은 고객 컨텍스트 밖(서비스 롤/PG 콜백)으로 분리한다.

### ❌ 반례
- 정책에 `EXISTS (SELECT … FROM other_table …)` 등 교차 조인·비즈니스 규칙
- `auth.uid()`/`current_account_id()`/`is_admin()`를 `(select …)` 없이 직접 호출
- RLS를 1차 인가로 신뢰하고 Server Action 필터를 생략
- 노출 스키마 테이블에 RLS/정책 누락(=CVE-2025-48757 클래스)

## 출처
- Supabase, "Row Level Security" — https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase, "RLS Performance and Best Practices" — https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- PostgreSQL, "Row Security Policies" — https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- NVD, "CVE-2025-48757" — https://nvd.nist.gov/vuln/detail/CVE-2025-48757
- PlanetScale, "RLS sounds great until it isn't" — https://planetscale.com/blog/rls-sounds-great-until-it-isnt
- PlanetScale, "Approaches to tenancy in Postgres" — https://planetscale.com/blog/approaches-to-tenancy-in-postgres
- postgres.fm, "RLS vs performance" — https://postgres.fm/episodes/rls-vs-performance
- Bytebase, "Postgres RLS Limitations and Alternatives" — https://www.bytebase.com/blog/postgres-row-level-security-limitations-and-alternatives/
- Permit.io, "Postgres RLS Implementation Guide" — https://www.permit.io/blog/postgres-rls-implementation-guide
- GaryAustin1, "RLS-Performance" (벤치마크) — https://github.com/GaryAustin1/RLS-Performance
