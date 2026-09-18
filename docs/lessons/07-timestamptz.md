# 07. TIMESTAMPTZ

## 왜 알아야 하는가

시간 타입은 "DB가 무엇을 저장하고 무엇을 표시하는가"를 안 헷갈려야 디버깅·로그 분석·해외 어드민 합류 시 사고가 안 납니다. PostgreSQL의 `TIMESTAMPTZ`는 MySQL의 `DATETIME(6)`과 *비슷해 보이지만 동작이 정반대*인 함정이 있습니다.

## TIMESTAMPTZ 동작

```
[저장] 서버 내부에서 UTC로 정규화하여 보관 (구현 디테일)
[입출력] 세션의 timezone 설정에 따라 자동 변환
```

**저장은 UTC, 표시는 사용자 TZ.** "한국인에게 UTC로 보여준다"가 아닙니다 — 자동으로 KST로 변환됩니다.

```sql
-- 세션 timezone = 'Asia/Seoul' (한국 어드민 환경)
INSERT INTO product (..., created_at) VALUES (..., DEFAULT);  -- now() = 12:00 KST
SELECT created_at FROM product LIMIT 1;
-- 결과: '2026-05-09 12:00:00+09'   ← KST로 보임

-- 같은 row, 세션 timezone = 'UTC'
SELECT created_at FROM product LIMIT 1;
-- 결과: '2026-05-09 03:00:00+00'   ← UTC로 보임 (같은 순간)

-- 같은 row, 세션 timezone = 'America/New_York'
SELECT created_at FROM product LIMIT 1;
-- 결과: '2026-05-08 23:00:00-04'   ← EDT로 보임 (같은 순간)
```

세션 timezone 변경:
```sql
SET TIME ZONE 'Asia/Seoul';                          -- 현재 세션만
ALTER ROLE my_admin SET timezone = 'Asia/Seoul';     -- 사용자 영구
ALTER DATABASE postgres SET timezone TO 'Asia/Seoul'; -- DB 영구 (Supabase Studio에서도 KST)
```

## TIMESTAMP vs TIMESTAMPTZ

| PG 타입 | TZ 처리 |
|---|---|
| `TIMESTAMP` (= `TIMESTAMP WITHOUT TIME ZONE`) | ❌ 입력값 그대로 저장. TZ 변환 안 함 |
| `TIMESTAMPTZ` (= `TIMESTAMP WITH TIME ZONE`) | ✅ UTC 정규화 저장, 세션 TZ로 자동 변환 |

선택 가이드:

| 의미 | 권장 |
|---|---|
| 실제 *발생 순간* (생성·수정·로그·이벤트) | `TIMESTAMPTZ` |
| *벽시계 시간* 그 자체 (영업시작 09:00, 약속 시간) | `TIMESTAMP` |

## MySQL과 비교

| | MySQL `DATETIME(6)` | PostgreSQL `TIMESTAMPTZ` |
|---|---|---|
| **소수초 정밀도** | 6자리 (마이크로초) | 6자리 (마이크로초, 기본값) |
| **타임존 처리** | ❌ 입력 그대로, 세션 TZ 무시 | ✅ UTC 정규화 + 자동 변환 |
| **저장 범위** | 1000-01-01 ~ 9999-12-31 | 4713 BC ~ 294276 AD |
| **2038 문제** | 없음 (자체 포맷) | 없음 |

MySQL의 `DATETIME(6)`은 PG의 `TIMESTAMP` (without time zone)에 가깝고, MySQL의 `TIMESTAMP(6)`이 PG의 `TIMESTAMPTZ`에 가깝습니다 (다만 MySQL TIMESTAMP는 1970~2038 한계 있음).

## "한국인만 쓰는 사이트인데 TIMESTAMPTZ 쓰면 헷갈리지 않나?"

**오해입니다.** TIMESTAMPTZ는 "사용자에게 UTC로 보여준다"가 아닙니다. 한국 환경에서 한국 어드민이 쿼리하면 KST로 보입니다. UTC가 노출되는 건 세션 TZ를 명시적으로 UTC로 둘 때만.

`TIMESTAMP` (without TZ)를 쓰면 오히려 다음 시나리오에서 사고:

| 시나리오 | TIMESTAMPTZ | TIMESTAMP |
|---|---|---|
| Vercel 서버가 한국 외 리전(미국 등)에서 `now()` | KST로 일관 표시 ✅ | 미국 시간이 들어가서 9시간 어긋남 ❌ |
| Metabase·BI 도구에서 동일 컬럼 조회 | TZ 정보 명시 → 자동 변환 ✅ | "이게 KST야 UTC야?" 추측 필요 ❌ |
| 일본·해외 어드민 합류 | 자동 변환 ✅ | 데이터 마이그레이션 필요 ❌ |
| 서머타임 적용 국가로 확장 | 안전 ✅ | "사라진 1시간" 버그 ❌ |
| 저장 비용 / 연산 성능 | 동일 (8 bytes) | 동일 (8 bytes) |

## 정밀도 명시

```sql
created_at TIMESTAMPTZ        -- 기본 = TIMESTAMPTZ(6), 마이크로초
created_at TIMESTAMPTZ(3)     -- 밀리초
created_at TIMESTAMPTZ(0)     -- 초 단위
```

기본 6은 안전한 디폴트. 6 이상 키울 수 없음.

## Postgres·Supabase 컨센서스

[PostgreSQL Wiki: Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This)에 명시:

> **Don't use timestamp (without time zone)**. Instead, use timestamp with time zone (timestamptz) by default.

대부분의 ORM(Drizzle, Prisma, Rails ActiveRecord 등) 기본값도 `timestamptz`.

## 이 프로젝트의 결정

**모든 timestamp 컬럼은 `TIMESTAMPTZ`.** 5개 테이블의 `created_at`, `updated_at` 모두 동일.

이유:
- Vercel은 글로벌 배포, 서버 리전 가변 → TIMESTAMPTZ가 일관성 보장
- 향후 해외 어드민 합류 / BI 도구 / 백업 분석 모두 안전
- 비용 동일 (8 bytes)
- 한국 어드민 환경에선 자동으로 KST 표시 → 운영상 차이 없음

KST 표시를 원할 때 옵션:
```sql
-- 현재 마이그레이션엔 적용 X. 필요하면 추가:
ALTER DATABASE postgres SET timezone TO 'Asia/Seoul';
```

## 자주 쓰는 패턴

### 한국 시간으로 명시 변환
```sql
SELECT created_at AT TIME ZONE 'Asia/Seoul' AS created_at_kst FROM product;
```

### 날짜만 추출 (KST 기준)
```sql
SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS created_date FROM product;
```

### 일자별 집계 (KST 기준)
```sql
SELECT (created_at AT TIME ZONE 'Asia/Seoul')::date AS day, COUNT(*)
FROM product
GROUP BY day
ORDER BY day DESC;
```

## 참고

- [PostgreSQL Docs: Date/Time Types (8.5)](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [PostgreSQL Wiki: Don't Do This — timestamp without time zone](https://wiki.postgresql.org/wiki/Don%27t_Do_This#Don.27t_use_timestamp.28without_time_zone.29)
- [David E. Wheeler: Always use TIMESTAMP WITH TIME ZONE](https://justatheory.com/2012/04/postgres-use-timestamptz/)
