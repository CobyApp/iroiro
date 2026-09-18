# 데이터베이스 및 인증 전략

커머스 MVP의 DB·Auth·관리자 데이터 입력 도구를 어떻게 선택했는지에 대한 기록.

## 결정

**Supabase (Postgres + Auth + Row Level Security)**

관리자 페이지는 [admin-architecture.md](./admin-architecture.md) 참조.

## 핵심 판단 기준

1. **관계형 데이터 적합성** — 상품·주문·사용자·재고는 트랜잭션과 join이 빈번해 Postgres가 적합
2. **Auth 통합** — 별도 인증 서비스 구축 비용을 0으로
3. **무료 티어** — MVP 단계에서 비용 발생 없이 시작
4. **마이그레이션 용이성** — 표준 Postgres라면 후속 이전이 자유로움

## 후보 비교

| 옵션 | 무료 티어 | DB 종류 | Auth | 강점 | 약점 |
|---|---|---|---|---|---|
| **Supabase** | 500MB DB, 50K MAU | Postgres | 내장 | DB+Auth+Storage+Realtime+Studio 통합 | DB 용량 제한, cold start |
| Neon | 0.5GB | Postgres | ❌ | 서버리스 Postgres, branching | Auth 별도 구축 |
| Cloudflare D1 | 5GB | SQLite | ❌ | CF 스택 통합, 무료 한도 큼 | SQLite 트랜잭션·동시성 제약 |
| Turso | 9GB, 분산 | SQLite | ❌ | 빠른 read, 분산 복제 | SQLite 한계 + Auth 별도 |
| PlanetScale | (무료 종료) | MySQL | ❌ | 스키마 브랜칭 | 무료 티어 폐지 |
| Firebase | 1GB Firestore, 50K read/일 | NoSQL | 내장 | Auth·실시간 강력 | NoSQL이라 join·트랜잭션 어려움 |

## 선택 근거

### Supabase를 선택한 이유

1. **올인원 통합** — DB, Auth, Storage(메타데이터용), Realtime, 자동 REST/GraphQL API를 한 콘솔에서
2. **표준 Postgres** — JOIN, 트랜잭션, RLS, 트리거 등 커머스에 필요한 기능 완비
3. **Row Level Security** — DB 레벨에서 사용자/관리자 권한 분리 가능 (보안 마지막 방어선)
4. **Studio** — 관리자 페이지 완성 전까지 데이터 입력·수정을 GUI로 처리 가능
5. **표준 Postgres이므로 탈출 비용 낮음** — 필요 시 self-hosted 또는 RDS로 이전 가능

### Neon을 선택하지 않은 이유

순수 Postgres만 제공해 Auth(NextAuth, Lucia 등)와 Storage를 따로 구성해야 한다.
MVP 단계에서 통합 도구를 사용하는 편이 개발 속도가 빠르다.
DB만 필요한 단계(예: 마이크로서비스 분리)가 되면 Neon으로 이전 가능.

### Cloudflare D1을 선택하지 않은 이유

CF 스택 통합과 무료 한도(5GB)는 매력적이지만 SQLite의 다음 한계가 커머스에 부담된다.
- 동시 쓰기가 한 번에 하나만 가능 → 주문 폭주 시 병목
- 복잡한 트랜잭션이나 동시성 제어가 약함
- 관리자 권한 분리(RLS 같은 기능)가 자체 제공되지 않음

상품 카탈로그 같은 read-heavy 부가 시스템에는 적합하지만 핵심 트랜잭션 DB로는 부족.

### Firebase를 선택하지 않은 이유

Auth와 실시간은 우수하지만 Firestore가 NoSQL이라 다음이 어렵다.
- 주문-상품-재고를 동시에 갱신하는 트랜잭션
- 매출 집계·필터·정렬 같은 분석 쿼리
- 관계 데이터 join

스키마가 명확한 커머스에는 관계형 DB가 더 자연스럽다.

## 데이터 모델 골자

상세 스키마는 별도 문서(추후 작성)로 분리하되, MVP 핵심 테이블은 다음과 같다.

| 테이블 | 역할 |
|---|---|
| `users` | 회원 정보 (Supabase Auth와 연결) |
| `products` | 상품 카탈로그 |
| `product_images` | 상품 이미지 메타데이터 (R2 URL 저장) |
| `orders` | 주문 헤더 |
| `order_items` | 주문 라인 (상품·수량·가격 스냅샷) |

## 참조 무결성 전략 (FK 미사용)

**DB 레벨 외래 키(FK) 제약을 두지 않는다.** 테이블 간 관계는 `*_id` 컬럼으로 표현하고, 참조 무결성은 애플리케이션 레이어에서 관리한다. FK 없이 스키마를 작성하는 구체 규칙은 [architecture/data-modeling.md](./architecture/data-modeling.md)의 "외래 키 / 관계 / 삭제 정책" 절을 따른다.

### 근거

- **확장성 선제 대비** — FK는 샤딩·수평 분할·서비스별 DB 분리 시 샤드 경계를 넘지 못한다. PlanetScale/Vitess가 분산 환경에서 FK를 비권장하는 이유다. 지금은 단일 Supabase에 의존하지만, 처음부터 FK 없는 구조로 잡아두면 후일 확장·DB 분리 시 스키마를 다시 뒤집지 않는다.
- **쓰기 성능·락** — FK 무결성 체크와 parent/child 락 경합을 원천 제거한다.
- **마이그레이션 유연성** — 삭제 순서 의존·드롭/재생성 제약 없이 스키마를 변경한다.
- **무결성 소유권 단일화** — 검증 로직을 앱(Server Action) 한 곳에 모은다.

### 감수하는 트레이드오프

- PostgREST 자동 관계 embedding·Studio 관계 탐색을 쓰지 못한다 → 명시적 쿼리 또는 computed relationship으로 대체.
- orphan을 DB가 막아주지 않는다 → 앱 레벨 검증 + 정기 orphan 점검으로 보완.
- FK가 만들던 인덱스가 자동 생성되지 않는다 → 관계 컬럼 인덱스를 **수동으로 필수** 생성.

이 결정은 데이터 접근 패턴 전반에 영향을 주므로, data-modeling.md의 규칙을 반드시 함께 따른다.

## 보안 전략

### Row Level Security (RLS)

모든 테이블에 RLS를 활성화하고 다음 원칙을 따른다.

- **읽기**: 본인 데이터만 (예: `orders` → `user_id = auth.uid()`)
- **쓰기**: 본인 데이터만, 또는 admin role
- **공개 데이터**: `products`처럼 모두 읽기 가능한 테이블은 명시적으로 정책 설정

### Auth Role 구분

- 일반 사용자: Supabase Auth 기본
- 관리자: `user_metadata.role = 'admin'`로 구분
- 클라이언트 권한 체크는 우회 가능하므로 RLS가 마지막 방어선

## 확장 시 검토 항목

- DB 500MB 초과 시 Supabase Pro ($25/월)
- 트래픽이 커지면 read replica 또는 Postgres connection pooler 도입
- 분석·BI가 필요해지면 별도 데이터 웨어하우스로 ETL
- 글로벌 사용자 증가 시 region 분산 검토
