# 06. TEXT vs VARCHAR

## 왜 알아야 하는가

MySQL을 거쳐온 개발자가 가장 자주 헷갈리는 부분. MySQL에선 `VARCHAR(n)`이 효율적이고 `TEXT`는 느려서 길이 명시가 거의 의무였지만, **Postgres에선 셋 다 같은 구현**이라 그 직관이 그대로 안 통합니다.

## 핵심 사실

| 타입 | 저장 형식 | VARCHAR(n) 대비 |
|---|---|---|
| `TEXT` | 가변 길이, 그대로 저장 | 기준 |
| `VARCHAR(n)` | 가변 길이 + 길이 체크 | **CPU 약간 더 씀** (측정 잡음 수준) |
| `VARCHAR` (n 없음) | TEXT와 동일 | 동일 |
| `CHAR(n)` | 항상 n자, 공백 패딩 | **저장 공간 더 씀** |

PostgreSQL 공식 문서:

> "There is no performance difference among these three types, apart from increased storage space when using the blank-padded type, and a few extra CPU cycles to check the length when storing into a length-constrained column."

## MySQL과의 차이

| | MySQL | PostgreSQL |
|---|---|---|
| `VARCHAR(n)` 성능 | TEXT보다 빠름 (다른 영역 저장) | TEXT와 동일 (같은 TOAST) |
| `TEXT` 성능 | 느림 | VARCHAR과 동일 |
| 길이 명시 동기 | 성능 + 검증 | **검증만** (성능 동기 사라짐) |
| `VARCHAR(255)` 관습 | 페이지·인덱스 최적화 | 무의미 (Postgres는 가변 페이지) |

`VARCHAR(255)` 같은 패턴은 **MySQL 시절의 유산**. Postgres엔 가져올 필요 없습니다.

## 두 진영

### 진영 A: TEXT + CHECK (Postgres-native)

```sql
name TEXT NOT NULL,
CONSTRAINT product_name_length CHECK (length(name) BETWEEN 1 AND 200),
CONSTRAINT product_name_format CHECK (name !~ '\n')
```

장점:
- **한도 변경이 부드러움** — `NOT VALID` 옵션으로 신규 INSERT만 적용 가능
- 길이 외 제약(정규식, 최소 길이, 형식)을 같은 CHECK로 표현
- Postgres 공식 가이드·모던 글들이 더 많이 권장

### 진영 B: VARCHAR(n) (cross-DB 호환)

```sql
name VARCHAR(200) NOT NULL,
```

장점:
- 스키마만 봐도 한도 보임
- 다른 DB(MySQL, Oracle)와 스키마 비교·이식이 쉬움
- ORM(Drizzle, Prisma) type 정의에 길이가 자연스럽게 반영
- JPA/Hibernate 같은 강타입 ORM과 친화

## 한도 변경 시 차이 (NOT VALID 패턴)

진영 A가 진짜로 빛나는 시나리오:

```sql
-- VARCHAR(200) → VARCHAR(500) 확장
ALTER TABLE product ALTER COLUMN name TYPE VARCHAR(500);
-- 큰 테이블이면 ACCESS EXCLUSIVE 락, 테이블 재작성 가능

-- TEXT + CHECK 한도 변경
ALTER TABLE product DROP CONSTRAINT product_name_length;
ALTER TABLE product ADD CONSTRAINT product_name_length
    CHECK (length(name) <= 500) NOT VALID;
ALTER TABLE product VALIDATE CONSTRAINT product_name_length;
-- 락 시간 짧음, 신규 INSERT부터 적용
```

다만 **수만 row 수준**에선 두 방법 모두 즉시 끝남. 차이는 수천만~수억 row 수준에서 의미 있음.

## 어느 쪽이 best practice인가

정직한 답: **모던 Postgres 가이드는 *대체로* TEXT+CHECK 권장**이지만 강제 룰이 아닙니다. VARCHAR(n)도 실무에서 흔하고 그 자체로 잘못된 선택이 아닙니다.

선택 기준:

| 상황 | 권장 |
|---|---|
| Postgres 전용, Postgres 컨벤션 따르고 싶음 | **TEXT + CHECK** |
| 다른 DB와 스키마 비교 가능성 있음 | `VARCHAR(n)` |
| 길이 제한이 자주 바뀔 것 같음 | **TEXT + CHECK** |
| 한도가 안정적이고 스키마 한눈에 보고 싶음 | `VARCHAR(n)` |
| 둘 다 OK | **한 가지로 통일** ← 가장 중요 |

## 이 프로젝트의 결정

**전 컬럼 `TEXT`로 통일.** 길이 제약은 **현재 미설정** — MVP 단계에선 입력 길이 제한이 자주 바뀔 수 있고, 운영하며 패턴이 보이면 그때 CHECK 추가.

향후 추가 권장 후보:

| 컬럼 | 권장 한도 | 이유 |
|---|---|---|
| `team.name` | 1~100 | `CHECK (length(name) BETWEEN 1 AND 100)` (현재는 비-empty만 강제) |
| `member.name` | 1~50 | 사람 이름은 짧음 |
| `product.name` | 1~200 | 검색·SEO 한도 |
| `product.description` | 제한 X | 본문 |
| `product.item_code` | `^[A-Z0-9-]{3,32}$` | 형식 강제 |
| `product_photo.r2_key` | 1~512 | 객체 키 길이 한도(S3는 1024바이트) 안에서 여유 있게 |
| `product_photo.alt_text` | 1~200 | 접근성 짧게 |

추가 시 패턴:

```sql
ALTER TABLE product
    ADD CONSTRAINT product_name_length
        CHECK (length(name) BETWEEN 1 AND 200) NOT VALID;
ALTER TABLE product VALIDATE CONSTRAINT product_name_length;
```

## CHAR(n)는 거의 안 씀

`CHAR(n)`은 항상 n자로 공백 패딩 → 저장 낭비 + 비교 시 헷갈림. 사용 정당한 경우:
- 진짜 고정 길이 식별자 (예: ISO 국가 코드 `CHAR(2)`)
- 외부 시스템 호환

그 외엔 TEXT 또는 VARCHAR.

## 참고

- [PostgreSQL Docs: Character Types (8.3)](https://www.postgresql.org/docs/current/datatype-character.html)
- [PostgreSQL Wiki: Don't Do This — char(n)](https://wiki.postgresql.org/wiki/Don%27t_Do_This#Don.27t_use_char.28n.29)
- [Maxim Orlov: char vs varchar vs text in PostgreSQL](https://maximorlov.com/char-varchar-text-postgresql/)
- [DEV: The Day I Chose VARCHAR(255) and Regretted It](https://dev.to/igornosatov_15/the-day-i-chose-varchar255-and-regretted-it-a-postgresql-string-story-29l5)
