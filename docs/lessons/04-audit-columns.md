# 04. Audit 컬럼

## 왜 알아야 하는가

"이 row를 누가 언제 만들고 언제 마지막으로 고쳤는가" — 데이터 변경 추적은 디버깅·책임 추적·일부 규제(GDPR, 개인정보보호법) 대응에 필요합니다. 솔로 운영이면 과한 장식이지만, 다수 admin 환경에선 사실상 필수.

## 4 컬럼 패턴

| 컬럼 | 의미 | 권장 NULL 정책 |
|---|---|---|
| `created_at` | 행 생성 시각 | NOT NULL, DEFAULT now() |
| `created_by` | 행을 만든 사용자 | nullable (시드·배치 작업 대비) |
| `updated_at` | 마지막 수정 시각 | NOT NULL, DEFAULT now() + 트리거로 갱신 |
| `updated_by` | 마지막 수정자 | nullable |

`updated_at` vs `modified_at`: Postgres·ORM(Drizzle, Prisma, Rails 등) 컨벤션 모두 `updated_at`. 한 프로젝트에 두 이름 섞이면 매핑·쿼리·문서화 모두 헷갈리니 통일.

## 각 컬럼별 가치

| 컬럼 | 단일 admin | 다수 admin |
|---|---|---|
| `created_at` | ✅ 항상 가치 있음 | ✅ |
| `updated_at` | ✅ 편집되는 테이블이면 | ✅ |
| `created_by` | ⚠️ 모든 row 값이 같음 → 무의미 | ✅ "누가 처음 입력했나" |
| `updated_by` | ⚠️ 같은 이유 | ✅ "누가 마지막에 손댔나" |

**솔로 운영이면 `*_by`는 인덱스 공간 차지하는 노이즈.** 다수 admin이거나 향후 가능성이 있으면 처음부터 추가가 후회 적음.

## 이 프로젝트에서 구현

세션의 `account_id`는 UUID지만, 이 프로젝트는 **`*_by`를 TEXT로 둠** — 비-UUID 식별자(시스템 액션, 외부 동기화 주체 등) 표기 가능성을 열어두기 위함:

```sql
created_by TEXT,
updated_by TEXT,
```

(이 프로젝트는 FK도 미설정. [05. Foreign Key 정책](./05-foreign-keys.md) 참고)

타입 트레이드오프 (TEXT vs UUID):

| | UUID | TEXT (이 프로젝트) |
|---|---|---|
| 저장 크기 | 16 bytes | 37 bytes (UUID 문자열) |
| 인덱스 효율 | 빠름 | 약간 느림 |
| 잘못된 값 차단 | 타입 에러로 막음 | 임의 문자열 허용 |
| 비-UUID 주체 표기 | ❌ 불가 | ✅ `'cron:nightly'`, `'shopify_sync'` 등 가능 |

### 두 가지 접근법

#### 옵션 A: DB 트리거로 자동 갱신 (이 프로젝트는 미채택)

```sql
-- 트리거는 "지금 누구인가"를 DB 안에서 알아야 한다 → 요청 컨텍스트 GUC에 의존(16 참고)
CREATE OR REPLACE FUNCTION public.set_audit_columns() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := current_setting('app.current_account_id', true);
    END IF;
    NEW.updated_at := now();
    NEW.updated_by := current_setting('app.current_account_id', true);
    RETURN NEW;
END;
$$;

CREATE TRIGGER team_audit BEFORE INSERT OR UPDATE ON team
    FOR EACH ROW EXECUTE FUNCTION set_audit_columns();
```

장점: 모든 INSERT/UPDATE에 자동 적용. psql 직접 SQL도 커버.
단점: 숨은 동작. "누구인가"를 DB에 알려주는 컨텍스트(Supabase라면 `auth.uid()`, 자체 인증이라면 트랜잭션 GUC)에 의존. 테스트 어려움. 트리거 디버깅 부담. 이력: 초기 마이그레이션엔 `auth.uid()` 기반 `set_audit_columns`가 있었고 앱 레벨 제어로 바꾸며 제거했다.

#### 옵션 B: 애플리케이션 레벨 제어 (이 프로젝트 ⭐)

```typescript
// Server Action 또는 Repository 레이어에서
async function createProduct(data, userId) {
    return db.insert(product).values({
        ...data,
        created_by: userId,
        updated_by: userId,
        // created_at, updated_at은 컬럼 DEFAULT now()로 자동
    });
}

async function updateProduct(id, data, userId) {
    return db.update(product)
        .set({
            ...data,
            updated_at: new Date(),
            updated_by: userId,
        })
        .where(eq(product.id, id));
}
```

장점:
- **명시적**: 코드만 보면 무엇이 일어나는지 명확
- **풍부한 컨텍스트**: 회원 `account.id` 외 시스템 식별자도 자유롭게 (`'cron:nightly'`, `'admin_panel'` 등)
- **테스트 단순**: 트리거 의존 X
- **인증 시스템 비의존**: DB가 요청 신원을 알 필요가 없다 — 세션에서 꺼낸 `account.id`를 앱이 그대로 넣는다

단점:
- 모든 INSERT/UPDATE 경로에서 *명시적 설정* 필요
- psql·Prisma Studio(`npm run db:studio`)·변경분 SQL 같은 직접 경로는 자동 갱신 X (운영 룰로 보완)
- 코드 경로 늘면 누락 위험 → 헬퍼·Repository 추상화로 일관성 유지

## INSERT/UPDATE 흐름 예시

```sql
-- 어드민 Alice (uid: aaa-...) 가 앱에서 INSERT
-- 앱 코드가 created_by 등을 명시적으로 박음
INSERT INTO team (name, created_by, updated_by)
VALUES ('르세라핌', 'aaa-...', 'aaa-...');
-- created_at, updated_at은 컬럼 DEFAULT로 자동 채움

-- 어드민 Bob (uid: bbb-...) 이 UPDATE
UPDATE team
SET name_i18n  = '{"en": "LE SSERAFIM"}'::jsonb,
    updated_at = now(),
    updated_by = 'bbb-...'
WHERE name = '르세라핌';
```

## 컬럼 배치 컨벤션

audit 컬럼은 **테이블 끝**에 두는 게 일반적:

```sql
CREATE TABLE product (
    -- ... 도메인 컬럼들 ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT
);
```

## 이 프로젝트의 결정

**5개 테이블 모두 4개 audit 컬럼 + 애플리케이션 레벨 제어**.

이유:
- 다수 admin 운영 가능성 있음 → audit 컬럼은 처음부터 두는 게 후회 적음
- 앱 레벨 제어는 *명시성·테스트 용이성*이 더 가치 있다고 판단
- 시스템 액션(`'cron:*'`, `'admin_dashboard'` 등) 표기 자유로움
- DB의 인증 컨텍스트와 결합 안 함 — 실제로 Supabase Auth → 자체 세션으로 갈아탈 때 audit 스키마는 손대지 않았다(이력)

운영 룰:
- INSERT 시 앱이 `created_by` 명시 (앱 헬퍼·Repository로 강제)
- UPDATE 시 앱이 `updated_at = now()` + `updated_by` 명시
- psql·Prisma Studio·변경분 SQL 사용은 *수동 명시* 필요 (또는 의도적 NULL 허용, 예: `'ops:manual'`)
- `created_at`, `updated_at`은 컬럼 DEFAULT now()라 INSERT 시 누락해도 자동

## 알아둘 함정

- **앱이 깜빡하면 audit 누락** — Repository·헬퍼로 강제. 직접 SQL은 운영 룰로 관리
- **`updated_at` UPDATE 자동 X** — DEFAULT는 INSERT만. UPDATE 시 명시 필요
- **bulk INSERT** — 앱 레이어에서 일괄 처리하면 자연스럽게 audit 채워짐
- **외부 도구(Prisma Studio·psql 등) 직접 입력** — audit 누락. 의도된 NULL로 받아들이거나 수동 명시

## 참고

- [PostgreSQL Docs: Trigger Procedures](https://www.postgresql.org/docs/current/plpgsql-trigger.html)
- [PostgreSQL Docs: TG_OP variable](https://www.postgresql.org/docs/current/plpgsql-trigger.html#PLPGSQL-DML-TRIGGER) (INSERT/UPDATE 분기)
