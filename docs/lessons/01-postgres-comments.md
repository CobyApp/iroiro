# 01. DDL 코멘트 (`COMMENT ON ...`)

## 왜 알아야 하는가

스키마에 *"이 컬럼은 무엇을 위한 것인가"* 같은 의도를 DB에 남겨두면, 자동 문서화 도구·ORM·신규 합류자 모두 그 정보를 그대로 활용할 수 있습니다. 단순 `--` 주석은 SQL 파서가 버리는 토큰이라 DB에 안 남습니다.

## 핵심 개념

**MySQL과 가장 다른 점**: PostgreSQL은 컬럼 정의 옆에 인라인으로 코멘트를 붙일 수 없습니다. 별도 `COMMENT ON ...` statement로 따로 등록해야 합니다.

| | MySQL | PostgreSQL |
|---|---|---|
| 인라인 컬럼 코멘트 | `name VARCHAR(50) COMMENT '한국어 표기'` ✅ | ❌ 문법 에러 |
| 별도 statement | `ALTER TABLE ... MODIFY COLUMN ... COMMENT '...'` | `COMMENT ON COLUMN team.name IS '...'` |
| 저장 위치 | `information_schema.columns.column_comment` | `pg_description` 시스템 카탈로그 |

## 문법

```sql
-- 테이블
COMMENT ON TABLE  team       IS '과거·현재 모든 아이돌/아티스트/팀';

-- 컬럼
COMMENT ON COLUMN team.name IS '다국어 이름 JSONB';

-- 함수 (시그니처까지 적어야 한다)
COMMENT ON FUNCTION public.next_order_no() IS '주문번호 발급';

-- 인덱스, 제약, 트리거 등도 가능
COMMENT ON INDEX  product_item_code_unique IS 'item_code가 NULL이 아닐 때만 unique';
```

코멘트를 비울 땐 빈 문자열 또는 `NULL`:
```sql
COMMENT ON COLUMN team.name IS NULL;  -- 코멘트 제거
```

## 조회

### psql 명령
```
\d+ product
```
컬럼 옆 Description 컬럼에 자동 표시.

### SQL 함수
```sql
-- 테이블 코멘트
SELECT obj_description('public.team'::regclass);

-- 컬럼 코멘트 (ordinal_position으로)
SELECT col_description('public.product'::regclass, 1);

-- 함수 코멘트
SELECT obj_description(oid, 'pg_proc')
FROM pg_proc
WHERE proname = 'next_order_no';
```

### information_schema 활용
```sql
SELECT
    column_name,
    col_description('public.product'::regclass, ordinal_position) AS comment
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'product'
ORDER BY ordinal_position;
```

## 코드 주석 vs DB 코멘트

| 종류 | 어디에 사는가 | 누가 보는가 |
|---|---|---|
| `-- 한국어 주석` (`db/schema.sql`) | 소스 파일 안 | 깃 저장소를 보는 개발자 |
| `COMMENT ON ...` | DB 시스템 카탈로그 | psql, ORM, BI 도구, 자동 문서화 |

둘 다 쓰는 게 정석. `db/schema.sql`의 `--` 주석은 *왜 이 SQL을 썼는가* 같은 결정 배경, `COMMENT ON`은 *컬럼이 무엇을 의미하는가* 같은 데이터 의미.

## 이 프로젝트의 결정

[`db/schema.sql`](../../db/schema.sql)(옛 마이그레이션 31개를 순서대로 합친 단일 정본)에서:

- 모든 **테이블**: `COMMENT ON TABLE` 부착
- **컬럼**: 초기 카탈로그 테이블은 비자명 컬럼만 달았고, 이후 도메인(회원·주문·게시판 등)은 `id`·audit 컬럼까지 대부분 달아 두었다 — `\d+`만으로 스키마를 읽을 수 있게
- **배치**: 각 테이블의 DDL → 인덱스 → COMMENT 블록을 한 묶음으로 둠. 통합 섹션으로 떨어뜨리지 않음 (스키마 + 의미를 한 화면에서 볼 수 있도록)
- **함수 코멘트는 현재 없음** — 초기엔 `set_audit_columns`·`is_admin` 두 함수에 달았지만, 트리거 대신 앱 레벨 audit([04](./04-audit-columns.md))·RLS 제거([15](./15-postgres-roles-and-rls.md))로 함수 자체가 사라졌다. 함수를 다시 만들면 `COMMENT ON FUNCTION`도 함께 단다.

## 참고

- [PostgreSQL Docs: COMMENT](https://www.postgresql.org/docs/current/sql-comment.html)
- [PostgreSQL Docs: Object Identifier Functions](https://www.postgresql.org/docs/current/functions-info.html#FUNCTIONS-INFO-COMMENT) (`obj_description`, `col_description`)
- [PostgreSQL Wiki: pg_description](https://wiki.postgresql.org/wiki/Pg_description)
