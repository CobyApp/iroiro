# 자유게시판(posts) 실 DB 검증 — 동시성 · RLS 백스톱

**일자:** 2026-07-23 · **브랜치:** `feat/community-posts` · **대상:** Plan 2(posts)

whole-branch 리뷰가 "설계는 inspection으로 correct, 실증만 남음"으로 유예했던 두 항목을
로컬 실 DB(Postgres 17.6, supabase local)에서 확증한 기록이다.

| 항목 | 방법 | 결과 |
| --- | --- | --- |
| A. `FOR UPDATE` 직렬화(5시나리오 × 양방향 + 음성대조) | 2세션 결정적 인터리빙 | **12 / 12 PASS** |
| B. RLS 백스톱(신고 2테이블) | `SET ROLE app` + GUC 주입 | **16 / 16 PASS** |
| C. dev:all 브라우저 E2E | 수동 클릭 | 미수행(스크립트 불가 — pre-main 게이트에 잔류) |

재현:

```bash
supabase start
./node_modules/.bin/dotenv -e .env.local -- node docs/superpowers/verification/2026-07-23-posts-concurrency-rls/concurrency.mjs
./node_modules/.bin/dotenv -e .env.local -- node docs/superpowers/verification/2026-07-23-posts-concurrency-rls/rls.mjs
```

두 스크립트 모두 멱등이며 DB 상태를 오염시키지 않는다(종료코드 0=전부 PASS):

- 데이터: sentinel(`author_code='zzconc_probe'` / `reporter='…f00d'` 등)로 시드·정리.
- 역할: `rls.mjs`는 `app` 롤 재현을 위해 SET 옵션이 없을 때만(`bool_or(set_option)` 집계)
  `GRANT … WITH SET TRUE`하고, 하네스가 **새 membership 행을 만든 경우** 종료 시
  `REVOKE app FROM postgres GRANTED BY postgres`로 그 행만 제거, **기존 행의 옵션만 바꾼 경우**
  `REVOKE SET OPTION`으로 되돌린다. grantor별 전체 membership 행(admin·inherit·set)의 시작=종료
  동등성을 마지막 케이스로 검증하고, 데이터 정리와 역할 원복은 각각 독립 finally로 수행한다.
- 안전장치: `rls.mjs`는 `DATABASE_URL` 호스트가 localhost가 아니면 실행을 거부한다.

---

## A. `FOR UPDATE` 직렬화 (`concurrency.mjs`)

### 방법

- 3개 세션: **A**(create측) · **H**(hide측) · **obs**(관찰/시드/검증).
- 잠금 보유 세션이 먼저 락을 잡은 뒤, 상대 세션의 충돌 문을 **await 없이** 발사하고
  `pg_stat_activity.wait_event_type='Lock'`이 관측될 때까지 폴링 → **블로킹(직렬화) 실증**.
  블로킹이 관측되지 않으면(타임아웃) 그 케이스는 FAIL.
- 격리수준 = **READ COMMITTED**(Prisma 기본과 동일, raw `BEGIN`).
- 각 SQL 조각은 `modules/posts/lib/mutations.ts` 원문을 **그대로** 옮겼고 스크립트 상단 상수에
  원본 라인을 주석으로 명시했다. 즉 "앱이 이 쿼리열을 실제로 방출하는가"는 `$queryRaw` 리터럴
  **코드 대조(inspection)**로, "DB가 이 쿼리열을 올바르게 직렬화하는가"는 이 하네스로 나눠 증명한다.

### 시나리오 → 불변식

| # | 경쟁 | 잠금(mutations.ts) | 불변식 |
| --- | --- | --- | --- |
| S1 | createComment(top) ∥ hidePost | 글 `FOR UPDATE` (l.97) ↔ `UPDATE post` (l.291) | hide 선점 ⇒ 댓글 거부(재검증 0행). create 선점 ⇒ 댓글 삽입 후 글 숨김(정상) |
| S2 | createComment(reply) ∥ hideComment(parent) | 부모 `FOR UPDATE` (l.106) ↔ `UPDATE post_comment` (l.331) | hide 선점 ⇒ 답글 거부 |
| S3 | createPostReport ∥ hidePost | 글 `FOR UPDATE` (l.199) ↔ `UPDATE post`+신고 actioned (l.291·296) | **숨김 글에 미처리(resolved_at IS NULL) 신고 0** |
| S4 | createCommentReport ∥ hideComment | 댓글 `FOR UPDATE` (l.248) ↔ `UPDATE post_comment`+신고 actioned (l.331·336) | **숨김 댓글에 미처리 댓글신고 0** |
| S5 | createCommentReport ∥ hidePost | 글 선잠금 `FOR UPDATE` (l.242, 순서 post→comment) ↔ `UPDATE post` (l.291) | hidePost 선점 ⇒ 댓글신고 글-재검증에서 거부 |

각 시나리오를 **양방향**(create 선점 / hide 선점)으로 강제. S3·S4는 불변식이 핵심이라
**음성대조**(FOR UPDATE 제거)로 락 제거 시 불변식이 깨짐을 재현 → 락이 load-bearing임을 증명.

### 결과 (12 / 12 PASS)

```
✅ S1A createComment(top) 선점 ∥ hidePost 블록→직렬화        — 댓글1 + 글숨김(정상 순서)
✅ S1B hidePost 선점 ∥ createComment 재검증 0행→거부         — 재검증 rows=0, 댓글0
✅ S2A createComment(reply) 선점 ∥ hideComment 블록→직렬화   — 답글 삽입 + 부모 숨김
✅ S2B hideComment(parent) 선점 ∥ reply 재검증 0행→거부      — 재검증 rows=0
✅ S3A createPostReport 선점 ∥ hidePost                      — 신고 생성→actioned, 미처리 0
✅ S3B hidePost 선점 ∥ createPostReport 재검증 0행→거부      — 미처리 0, 신고 미생성
✅ S3-neg 음성대조(FOR UPDATE 제거)                          — 숨김 글에 미처리 신고 잔존=위반 재현
✅ S4A createCommentReport 선점 ∥ hideComment                — 신고 생성→actioned, 미처리 0
✅ S4B hideComment 선점 ∥ createCommentReport 재검증 0행→거부 — 미처리 0
✅ S4-neg 음성대조(댓글 FOR UPDATE 제거)                      — 숨김 댓글에 미처리 신고 잔존=위반 재현
✅ S5A createCommentReport 선점 ∥ hidePost 블록→직렬화        — 댓글신고1 생성 + 글숨김(별도 처리)
✅ S5B hidePost 선점 ∥ createCommentReport 글 재검증 0행→거부 — 댓글신고 미생성
```

> S3A 불변식은 **READ COMMITTED + 행 잠금**에 의존한다. H의 신고-actioned `UPDATE`는 R이 커밋한
> 뒤(블로킹 해제 후) 실행되므로 새 스냅샷에서 R의 신고를 보고 처리한다. 앱이 REPEATABLE READ로
> 바뀌면 이 성질이 깨지므로, 격리수준 유지가 전제다(현재 앱은 기본값 READ COMMITTED).

---

## B. RLS 백스톱 (`rls.mjs`)

### 배경 — RLS는 현재 "정의만 되고 우회됨"

앱은 **owner 롤 `postgres`(BYPASSRLS)**로 접속한다(`DATABASE_URL=…postgres@…`). 따라서 신고
2테이블에 걸린 RLS는 **현재 우회된다** — 이는 결함이 아니라 `init_catalog` 마이그레이션이 명시한
의도된 상태다: *"app으로 전환 전까지 RLS는 정의만 되고 우회됨(현 동작 유지)"*.

- RLS는 비특권 **`app` 롤**로 전환할 미래를 대비한 **심층방어 백스톱**이다.
- 본인/admin 판정 GUC(`app.current_account_id`, `app.is_admin`)를 DAL이 `set_config`로 주입하는
  배선은 **아직 없다**(앱이 postgres로 접속해 RLS를 우회하므로 현 시점 불필요 — 관측사항이지 결함 아님).

이 검증은 **"`app` 롤을 켰을 때 정책이 의도대로 강제되는가"**를 `SET ROLE app` + `set_config`로
시뮬레이션해 확증한다. 하네스가 app을 흉내내려면 SET 옵션이 필요한데(PG16+: admin_option이 있어도
SET 옵션이 없으면 `SET ROLE` 불가), membership은 grantor별로 여러 행이 될 수 있어
`bool_or(set_option)`으로 SET 가능 여부를 집계한다. 없으면 `GRANT app TO postgres WITH SET TRUE`하되,
**하네스가 새 행을 만든 경우**엔 종료 시 `REVOKE app FROM postgres GRANTED BY postgres`로 그 행만
제거하고, **기존 행의 옵션만 바꾼 경우**엔 `REVOKE SET OPTION`으로 되돌린다(supabase_admin 등 다른
grantor 행은 불변). 데이터 정리와 역할 원복은 각각 독립 finally로 수행하고, grantor별 전체 membership
행의 시작=종료 동등성을 마지막 케이스로 검증한다(로컬 검증 전용, 앱 런타임과 무관).

### 결과 (16 / 16 PASS)

precondition: `app.rolbypassrls = false` (RLS 적용 대상 확인).

| 케이스 | 기대 | 결과 |
| --- | --- | --- |
| R1/CR1 본인 명의 `INSERT … RETURNING` | 허용 + 1행 반환(Prisma `create()` 경로) | ✅ |
| R2/CR2 타인 명의 INSERT | 차단(WITH CHECK, 42501) | ✅ |
| R3 GUC 미설정 INSERT | fail-closed 차단 | ✅ |
| R4/CR3 비admin SELECT | 본인 신고만 | ✅ |
| R5 admin SELECT | 전체 | ✅ |
| R6 GUC 미설정 SELECT | 0행 | ✅ |
| R7/CR4 비admin UPDATE | 0행(정책상 admin 전용) | ✅ |
| R8 admin UPDATE | 반영 | ✅ |
| R9 admin 미허용 컬럼 UPDATE | 권한 거부(컬럼 GRANT 밖, 42501) | ✅ |
| R10/CR5 DELETE | 권한 거부(테이블 GRANT 없음, 42501) | ✅ |
| 역할 상태 완전 원복 | membership 전체(grantor·admin·inherit·set) 시작=종료(오염 없음) | ✅ |

---

## 잔여(미수행)

- **C. dev:all 브라우저 E2E** — 글/댓글/답글 작성·수정·삭제, 신고, admin 숨김/해제/신고큐/숨김댓글탭의
  실제 클릭 경로. 스크립트화 불가하여 이번 실증 범위 밖. whole-branch 리뷰의 pre-main(→main) 게이트에
  수동 항목으로 잔류.
