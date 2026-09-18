# 05. Foreign Key 정책

## 왜 알아야 하는가

FK는 DB 레벨의 **데이터 무결성 보장 장치**입니다. "존재하지 않는 사용자를 가리키는 row가 들어오는 상황"을 DB가 막아주거나, 부모 row 삭제 시 자식을 어떻게 처리할지(CASCADE/RESTRICT/SET NULL) 자동화합니다. 동시에 INSERT/UPDATE 시 부모 검증 비용과 락 획득 패턴을 만듭니다.

## FK가 *진짜로* 거추장스러워지는 환경

| 환경 | FK 사용? | 이유 |
|---|---|---|
| **초대규모 분산 DB** (Uber, Stripe 일부 도메인) | ❌ | 샤딩으로 cross-shard FK 자체 불가 |
| **마이크로서비스** | 🟡 서비스 경계 가로질러서는 안 씀 | 서비스 자율성·독립 배포 |
| **단일 DB, 같은 도메인 내** | ✅ | 무결성 ↑, 비용 거의 0 |
| **레거시 MyISAM/오래된 MySQL** | 🟡 | MyISAM은 FK 자체 미지원 |

**"현업에서 FK 안 쓴다"는 통념의 실체**: Uber·Pinterest 같은 초대규모·샤딩 환경에서 *어쩔 수 없이* 빼는 것이 일반화되어 들리는 것. 일반 회사 규모(단일 Postgres, 수만~수백만 row)에서는 FK가 정석입니다. [PostgreSQL Wiki — Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This)도 "Don't avoid foreign keys"를 못박아 둠.

## FK 비용의 실제 크기

INSERT/UPDATE 시 FK 검증 = 부모 테이블 PK 인덱스 조회 1회.

- 부모 테이블이 작을수록 캐시 히트 → 마이크로초 단위
- 백만 row 수준에서도 인덱스 조회는 O(log n)
- 실측하면 측정 잡음에 묻히는 수준

FK가 *진짜* 부담이 되는 시나리오:
- 초당 수천 건 INSERT, 부모가 hot row 하나에 집중 → 락 경합
- 대량 import (`COPY`)에서 row마다 검증 → DISABLE TRIGGER 패턴 필요
- cross-shard FK → 분산 환경에선 검증 자체 불가

이 프로젝트(굿즈 카탈로그, 어드민 몇 명 쓰기)에서는 **세 가지 모두 해당 안 됨.**

## ON DELETE 옵션

FK를 걸 때 부모 삭제 시 자식 처리 정책:

| 옵션 | 동작 | 사용 예 |
|---|---|---|
| `NO ACTION` (기본) | 삭제 직전 자식 있으면 차단. 트랜잭션 끝에 검증 | 거의 안 씀 (RESTRICT 권장) |
| `RESTRICT` | 즉시 차단. NO ACTION보다 명확 | 부모를 보호하고 싶을 때 (그룹 삭제 막기) |
| `CASCADE` | 자식도 같이 삭제 | 자식이 부모 없이 의미 없을 때 (사진 ↔ 상품) |
| `SET NULL` | 자식의 FK 컬럼을 NULL로 | 자식은 남기되 참조만 끊을 때 (audit `created_by`) |
| `SET DEFAULT` | 자식의 FK 컬럼을 DEFAULT 값으로 | 드물게 사용 |

선택 가이드:
- 자식이 부모 없으면 의미 없음 → `CASCADE`
- 자식이 부모 *기록*은 보존해야 함 → `SET NULL` (예: 사용자 삭제 후 audit row 보존)
- 부모 삭제를 *애초에 막아야* 함 → `RESTRICT`

## FK가 막아주는 시나리오

```sql
-- FK 있을 때
INSERT INTO product (team_id, ...) VALUES (999, ...);
-- ERROR: insert or update on table "product" violates foreign key constraint
--        Key (team_id)=(999) is not present in table "team".

DELETE FROM team WHERE id = 5;
-- ERROR: update or delete on table "team" violates foreign key constraint
--        Key (id)=(5) is still referenced from table "product".
```

```sql
-- FK 없을 때
INSERT INTO product (team_id, ...) VALUES (999, ...);
-- 성공. 999는 존재하지 않는 팀이지만 DB는 모름

DELETE FROM team WHERE id = 5;
-- 성공. 팀 5를 가리키던 상품 30개는 team_id=5로 남아 있음 (orphan)
SELECT t.name FROM product p LEFT JOIN team t ON t.id = p.team_id WHERE p.id = ...;
-- name = NULL ← 화면에 빈칸. 디버그 한참 걸림
```

## 이 프로젝트의 결정

**모든 FK 미설정.** 도메인(`team_member`, `product`, `product_photo`)·auth (`*_by` 컬럼) 양쪽 모두 DB FK 없음. 무결성은 애플리케이션 레이어에서 관리.

선택 배경:
- 사용자 결정에 따른 의도적 선택
- 단일 Postgres 환경이라 FK 비용은 무시할 만하지만, *제약으로 인한 ALTER 부담·운영 유연성 측면*을 우선
- 컬럼 타입(`BIGINT`, `UUID`)과 NOT NULL 제약은 그대로 유지

### 앱 레이어가 책임지게 된 것

다음은 이제 코드에서 직접 검증해야 합니다:

| 시나리오 | 책임 |
|---|---|
| `product.team_id`가 실제 존재하는 팀인지 | 서버 액션 / Server Component에서 검증 |
| `product` 삭제 시 관련 `product_photo` 정리 | 트랜잭션으로 같이 DELETE (전엔 CASCADE가 했음) |
| `group`/`member` 삭제 시 참조 상품·이력 정리 | 사전 카운트 조회 후 차단 또는 일괄 삭제 |
| `created_by` UUID가 실제 `auth.users`에 있는지 | (audit 조회 시 LEFT JOIN으로 우회 — 대부분 무관) |

### 무결성 보강 옵션

운영하면서 무결성 사고가 보이면 점진적으로 보강:

```sql
-- 옵션 A: 사후에 FK 추가 (NOT VALID로 락 짧게)
ALTER TABLE product
    ADD CONSTRAINT product_team_id_fk
        FOREIGN KEY (team_id) REFERENCES team(id) NOT VALID;

ALTER TABLE product VALIDATE CONSTRAINT product_team_id_fk;

-- 옵션 B: CHECK 제약으로 부분 검증
ALTER TABLE product
    ADD CONSTRAINT product_team_id_positive CHECK (team_id IS NULL OR team_id > 0);

-- 옵션 C: 트리거로 커스텀 검증
-- (FK처럼 강제하되 ON DELETE 정책을 직접 짜고 싶을 때)
```

## 트레이드오프 정리

이 결정으로 *얻은 것*:
- 스키마 ALTER 자유도 (테이블 순서·삭제 순서 신경 안 써도 됨)
- 대량 INSERT 시 트리거 비활성화 패턴 단순화
- "FK 제약으로 막혔다" 디버깅 사라짐

이 결정으로 *잃은 것*:
- DB 레벨 무결성 보장 (앱 버그가 곧바로 데이터 깨짐으로 이어짐)
- 자동 cascade·restrict 동작 (앱 코드에서 직접 처리)
- ORM이 FK 정보 활용한 자동 JOIN 제안 등 일부 편의

## 참고

- [PostgreSQL Wiki: Don't Do This — Foreign keys](https://wiki.postgresql.org/wiki/Don%27t_Do_This)
- [PostgreSQL Docs: Foreign Keys](https://www.postgresql.org/docs/current/tutorial-fk.html)
- [PostgreSQL Docs: ALTER TABLE — NOT VALID 옵션](https://www.postgresql.org/docs/current/sql-altertable.html)
