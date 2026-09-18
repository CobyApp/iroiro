# 장바구니·주문·결제 플로우 설계

**구현 상태**: ✅ 구현 완료 (`feat/cart-order-payment` 브랜치) — 장바구니 담기부터 주문·결제·어드민 배송비 설정까지 전 단계 구현 + 테스트 통과(`npm run validate`).

> 관련 코드: `modules/cart/`(장바구니), `modules/orders/`(주문·결제·배송비 정책), `lib/payments/`(게이트웨이 포트 + mock 어댑터, `PAYMENT_PROVIDER=mock`), `delivery_policy` 테이블(`db/schema.sql`의 `init_order` 섹션). 결제 상태에 `in_progress` 추가(승인 직전 재고 선점 락). 실 PG 전환·환불·`pending` 만료 배치는 아래 "미해결·후속" 참조.
> DB 경로 적용: 스키마는 `db/schema.sql` 단일 파일이라 로컬은 `npm run db:reset`로 재적용. 인증이 DB 세션 기반이라 로컬 수동 테스트는 `npm run dev:all`(compose의 postgres)에서 로그인 후 가능.

> 관련: [db/schema.sql](../db/schema.sql)(`init_order` 섹션) ·
> [architecture/data-modeling.md](./architecture/data-modeling.md)(재고 원자 차감 룰) ·
> [architecture/db-authorization-review.md](./architecture/db-authorization-review.md)(app 롤·GRANT 경계) ·
> [lessons/16](./lessons/16-transaction-guc-context.md)(트랜잭션 GUC — 참고) ·
> [account-linking.md](./account-linking.md)(설계 문서 선례)

## 결정

1. **재고는 결제 승인 "직전"에 원자적 조건부 UPDATE로 선점한다 — 배민 방식.** 주문 생성(placeOrder) 시점이 아니라 `confirmPayment` 안에서 게이트웨이 승인 호출 직전에 차감하고, 승인 실패 시 즉시 복원한다. `UPDATE product SET stock_quantity = stock_quantity - n WHERE id = ? AND stock_quantity >= n` — 영향 행 0이면 품절로 트랜잭션 롤백. SELECT-then-UPDATE, `SELECT FOR UPDATE`는 쓰지 않는다.
2. **결제는 요청 2개 · 트랜잭션 3개로 분리한다.** tx#1(주문 생성 — 재고 차감 없음) / tx#2(선점 + payment `in_progress` 전이) / tx#3(승인 반영). **게이트웨이 호출은 어떤 트랜잭션에도 속하지 않는다**(네트워크 호출 중 락 보유 금지).
3. **PG는 `PaymentGateway` 포트 뒤에 둔다.** `lib/payments/`에 인터페이스 + mock 어댑터. `env.PAYMENT_PROVIDER`(기본 `mock`)로 어댑터를 교체하며, confirm 계약은 실 PG(Toss `confirm(paymentKey, orderId, amount)`) 형태를 그대로 따라 교체 시 도메인 코드 변경이 없다.
4. **금액은 서버가 단일 지점(`calculateOrderAmounts`)에서 재계산한다.** 클라이언트 금액은 신뢰하지 않는다. 단 클라이언트가 본 합계(`expectedTotalAmount`)를 받아 서버 계산과 다르면 "가격 변경" 에러로 거부한다(조용한 금액 변경 방지). 승인 후에는 `approvedAmount === order.totalAmount`를 검증한다.
5. **배송비는 `delivery_policy` 1행 테이블로 어드민이 관리한다.** 코드 상수·env가 아니라 DB — 어드민 설정 화면(`/admin/settings`)에서 기본 배송비와 무료 배송 기준(`free_threshold_amount`, NULL = 제도 없음)을 변경한다. 주문별 배송비는 `order.delivery_amount`에 스냅샷되므로 정책 변경이 과거 주문에 영향을 주지 않는다.
6. **취소는 종결 상태, 재결제는 새 주문.** (스키마 리뷰 때 결정 — `payment_order_unique`가 1:1 백스톱.) 사용자 취소는 `pending` 주문만 허용하며 **재고 복원이 필요 없다**(선점 전이므로). `paid` 취소(환불)는 실 PG 도입 시 `gateway.cancel`과 함께.
7. **상태 어휘는 소문자 TEXT + 상수 단일 진실.** `SALE_STATUSES` 관례를 따라 `modules/orders/types.ts`에 정의한다.
   - order: `pending → paid → shipped → delivered`, 종결 `canceled`
   - payment: `ready → in_progress → approved | failed`, `approved → canceled`(환불, 후속). `in_progress` = 재고 선점 완료·승인 진행 중(Toss 실제 상태 흐름 READY→IN_PROGRESS→DONE과 일치) — 크래시 잔존 식별과 중복 결제 방지 락을 겸한다.
8. **도메인 배치는 `modules/cart` + `modules/orders`.** (overview.md가 예정한 도메인명 그대로.) 주문 생성이 장바구니를 소비하는 것은 도메인 간 **코드 import 없이 DB 레벨 접근**으로 처리한다(트랜잭션 원자성은 페이지 합성으로 해결 불가). 신원 조회 `getCurrentAccount`(modules/auth/dal.ts)는 admin 예외처럼 **모든 모듈이 import 가능한 예외**로 conventions.md에 명문화한다.
9. **`USE_MOCK_DATA` 분기는 흐름 데모 전용.** 재고 동시성 로직은 DB 경로에만 존재한다. mock 경로는 인메모리 스토어로 주문 흐름만 재현하고 products mock 재고는 건드리지 않는다(도메인 간 mock store import 금지).
10. **체크아웃 UX**: 주소는 **Daum 우편번호 검색**으로 입력한다 — 우편번호·기본주소는 검색 결과로 자동 채움(readOnly), 상세주소만 수기. 실물 배송의 주소 오류 비용을 줄이기 위한 선택으로, 외부 스크립트 1건이 추가된다(보안 리뷰 WARN 예상 — 근거는 이 문서). 상품 상세에서는 **수량을 선택해 담는다**(재고 한도 스테퍼, 재고 1개면 스테퍼를 생략하고 1개 고정).

### 왜 (근거)

- **승인 직전 선점 — 배민 검증 결과**: 배민 commerce-server 참고 문서의 체크아웃 시퀀스가 근거. 주문서 생성(`/v1/ordersheet/creation`)은 재고를 건드리지 않고(DB 저장조차 안 함 — Valkey 캐시), **`/v1/pay/validate/pay-approve-before`에서 재고 선점(preemptStock)** 후 외부 PG 승인이 진행되며, 미승인이면 실패 스냅샷 + 재고 복원. 보상 로직도 "결제 실패 시 재고복구만"으로 단순하다. 이 방식은 재고 잠금 창을 PG 승인 왕복(초 단위)으로 최소화해 **미결제 pending 방치가 재고를 잠그는 문제 자체를 없앤다**. 트레이드오프는 결제 버튼을 누르는 순간의 품절 실패 가능성인데, 승인 전이라 과금이 없고 중고 단품 선착순("결제 완료가 곧 확보") UX로 자연스럽다.
- **원자적 조건부 UPDATE**: [data-modeling.md](./architecture/data-modeling.md)의 기존 결정 — "재고 차감 read-check-write는 조건을 단일 UPDATE의 WHERE에 넣어야 음수 유실이 없고, CHECK는 그 위 백스톱이다". PG는 READ COMMITTED에서 동시 UPDATE를 재평가하므로 마지막 1개를 두 명이 동시에 사면 정확히 한 명만 성공한다. `product_stock_non_negative` CHECK(SQLSTATE `23514`)가 최후 방어선.
- **트랜잭션 밖 게이트웨이 호출**: Supabase Postgres 베스트 프랙티스 "Keep Transactions Short"의 잘못된 예가 정확히 이 케이스다 — "주문 행 잠금 후 결제 API HTTP 호출(2~5초) 동안 다른 쿼리가 모두 블록". 검증·API 호출은 밖에서, 락은 짧은 UPDATE에서만.
- **배송비 테이블(전용 1행) vs key-value 설정 테이블**: 범용 `setting(key, value TEXT)`은 타입·CHECK 제약을 잃어 data-modeling.md의 명시적 스키마 철학과 어긋난다. 전용 테이블은 `delivery_fee INT NOT NULL CHECK (>= 0)`처럼 도메인 불변식을 DB가 강제한다. 정책 이력 테이블은 과잉 — 주문별 스냅샷(`order.delivery_amount`)이 이미 과거를 보존한다.
- **포트/어댑터 출처** (references.md 절차 — 프로덕션 OSS 인용): [medusajs/medusa](https://github.com/medusajs/medusa)의 `AbstractPaymentProvider`(Stripe 등이 어댑터로 구현, 수동 결제용 system provider 내장), [vendure-ecommerce/vendure](https://github.com/vendure-ecommerce/vendure)의 `PaymentMethodHandler` + 코어가 export하는 `dummyPaymentHandler`. mock 실패 트리거를 마법값으로 하는 것은 Stripe 테스트 카드(`4000…0002` 거절) 관례.
- **2-요청 분리**: Toss 위젯 흐름(위젯 결제 → successUrl 리다이렉트 → 서버 confirm)과 배민 문서의 주문 생성/결제 승인 분리 구조를 그대로 따른 것. mock 단계부터 이 모양을 유지해야 실 PG 교체가 페이지 1개(결제 페이지) 교체로 끝난다.

## 플로우 개요

```
상품 상세(/products/[id])
  │ AddToCartButton → addCartItem()                        [로그인 필요]
  ▼
/cart ── CartView: 수량 조절·삭제·합계 ── "주문하기" ─▶ /checkout
                                                  │ CheckoutForm: 배송지 입력
                                                  │ placeOrder()               ◀ tx#1 (재고 차감 없음)
                                                  │   재고·판매상태 소프트 검증
                                                  │   + order(pending) + order_item 스냅샷
                                                  │   + address + payment(ready)
                                                  │   + history + cart 비우기
                                                  ▼
                          /checkout/[orderNo]/pay    (mock 결제 페이지 = 실 PG 위젯 자리)
                             │ confirmPayment()
                             │   payment ready→in_progress + 재고 선점   ◀ tx#2 (배민 pay-approve-before)
                             │   gateway.confirm()                       ◀ 트랜잭션 밖
                             │   승인 반영(approved + paid)               ◀ tx#3 (짧게)
                             ├─ 성공 ────────▶ /orders/[orderNo]/complete
                             ├─ 선점 실패(품절) ▶ payment failed + order canceled (복원·과금 없음)
                             └─ 승인 실패 ────▶ payment failed + order canceled + 재고 복원
/orders ── 주문 내역 목록 ── /orders/[orderNo] 상세

/admin/settings ── DeliveryPolicyForm: 기본 배송비·무료 기준 변경 (isAdmin 가드)
```

## 상태 모델

```
order:    pending ──confirmPayment 성공──▶ paid ──(어드민, 후속)──▶ shipped ──▶ delivered
             │
             ├─ confirmPayment 실패(품절·승인 거절) ─▶ canceled
             └─ cancelOrder(사용자, pending만) ──────▶ canceled   ※ 재고 복원 불필요 — 선점 전

payment:  ready ──tx#2 선점──▶ in_progress ──승인──▶ approved ──(환불, 후속)──▶ canceled
             │                     │
             │                     └─ 거절/금액 불일치 ─▶ failed  ※ 재고 복원
             ├─ 선점 실패 ─▶ failed ('품절')                      ※ 복원 없음
             └─ 주문 취소 ─▶ canceled
```

- 모든 order 상태 전이는 같은 트랜잭션에서 `order_status_history`에 INSERT (`status_changed_at` = 전이 시각).
- `canceled`는 종결 — 재결제 없음, 다시 사려면 새 주문(스키마의 `payment_order_unique`가 이를 강제).
- `ready → in_progress` 전이는 **조건부 UPDATE**(`WHERE status = 'ready'`)로 수행 — 동시 confirm 요청 중 정확히 하나만 통과하는 중복 결제 방지 락을 겸한다.
- pending 주문은 재고를 잠그지 않으므로 방치돼도 무해하다(주문 정리 목적의 만료만 후속).
- 상수: `ORDER_STATUSES`/`PAYMENT_STATUSES` + 라벨 맵(`결제 대기/결제 완료/발송 완료/배송 완료/취소됨`)을 `modules/orders/types.ts`에 — `SALE_STATUS_LABEL` 패턴.

## 재고 동시성 — 승인 직전 원자적 조건부 차감

`modules/orders/lib/stock.ts` — 트랜잭션 클라이언트를 주입받는 순수한 도메인 함수(단위 테스트 가능). **호출 위치는 `confirmPayment`의 tx#2** — placeOrder는 재고를 건드리지 않는다.

```ts
// tx 주입: confirmPayment의 $transaction(tx#2) 안에서 호출
export async function decrementStock(
  tx: Prisma.TransactionClient,
  lines: Array<{ productId: number; quantity: number }>,
): Promise<void> {
  // 데드락 방지: 항상 product_id 오름차순으로 잠금 (lock-deadlock-prevention)
  const sorted = [...lines].sort((a, b) => a.productId - b.productId);
  for (const line of sorted) {
    const affected = await tx.$executeRaw`
      UPDATE product
      SET stock_quantity = stock_quantity - ${line.quantity}, updated_at = now()
      WHERE id = ${BigInt(line.productId)}
        AND sale_status = 'active'
        AND stock_quantity >= ${line.quantity}`;
    if (affected === 0) throw new SoldOutError(line.productId); // → tx#2 전체 롤백
  }
}

export async function restoreStock(tx, lines): Promise<void> {
  // 승인 실패 보상 전용. 단순 증가 — 조건 불필요, CHECK 위반 불가. 정렬은 동일하게 유지.
}
```

- `$executeRaw` 태그드 템플릿 = 파라미터라이즈드(문자열 연결 금지 — security-review criterion 5).
- 영향 행 0의 의미: 품절 **또는** 판매 중지(`sale_status !== 'active'`) — 사용자 메시지는 "품절되었거나 판매가 종료된 상품입니다".
- 재고 잠금 창 = tx#2 커밋 ~ tx#3(또는 복원) 커밋 — 게이트웨이 왕복 포함 초 단위. mock은 사실상 즉시.
- CHECK 위반(23514)이 실제로 발생하면 로직 버그다 — DAL에서 도메인 에러로 매핑하되(unique 가드와 동일 패턴) 발생 자체를 버그로 취급.
- 품절 표시는 `stock_quantity === 0`에서 파생(기존 UI 관례) — `sale_status` 동기화 불필요.
- `app` 롤 권한 정합성 확인 완료: `GRANT UPDATE ON product TO app`(init_catalog:239) ✓.

## 배송비 정책 — `delivery_policy` (신규 테이블)

`init_order.sql`에 in-place 추가(pre-launch 워크플로우) + Prisma 모델. 주문 도메인 소속.

```sql
-- delivery_policy : 배송비 정책 (1행 고정)
CREATE TABLE delivery_policy
(
    id                    BIGINT      PRIMARY KEY,
    delivery_fee          INT         NOT NULL,
    free_threshold_amount INT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE delivery_policy
    ADD CONSTRAINT delivery_policy_singleton CHECK (id = 1),
    ADD CONSTRAINT delivery_policy_fee_non_negative CHECK (delivery_fee >= 0),
    ADD CONSTRAINT delivery_policy_threshold_non_negative CHECK (free_threshold_amount >= 0);

INSERT INTO delivery_policy (id, delivery_fee) VALUES (1, 3500);  -- 시드 (어드민에서 변경)

REVOKE ALL ON delivery_policy FROM anon, authenticated, app;
GRANT SELECT, UPDATE ON delivery_policy TO app;   -- INSERT 불필요: 시드 1행 고정, 행 추가는 CHECK가 차단
```

- `CHECK (id = 1)` singleton — 정책은 항상 1행. 이력 테이블 없음(주문 스냅샷이 과거 보존).
- `free_threshold_amount`: 상품 합계가 이 값 이상이면 배송비 0원 + UI 넛지("○원 더 담으면 무료 배송"). NULL이면 무료 배송 제도 없음. 시드는 NULL로 시작.
- 계산: `deliveryAmount = (freeThreshold != null && productAmount >= freeThreshold) ? 0 : deliveryFee`.
- 어드민이 배송비를 바꾸는 순간 체크아웃 중이던 사용자는 `expectedTotalAmount` 불일치 가드가 잡는다("가격이 변경되었습니다").
- 경계 데이터 아님 → RLS 없음(도메인 관점 판단 — 방어선은 app 롤 GRANT, db-authorization-review 기준). Data API 비노출.

## 결제 게이트웨이 포트/어댑터 — `lib/payments/`

횡단 인프라(룰 1: 다른 커머스로 옮길 때 따라간다) → `lib/`. 도메인 상태 전이는 전부 `modules/orders`에 남고, 이 레이어는 외부 PG 통신만 안다.

```
lib/payments/
├── types.ts     PaymentGateway 인터페이스 + 입출력 타입
├── mock.ts      MockPaymentGateway (기본 어댑터)
└── index.ts     getPaymentGateway(): env.PAYMENT_PROVIDER로 어댑터 선택
```

```ts
// lib/payments/types.ts
export interface PaymentGateway {
  readonly provider: string; // 'mock' | 'toss' | ...

  /** 결제 승인. Toss POST /v1/payments/confirm 대응. 반드시 DB 트랜잭션 밖에서 호출. */
  confirm(input: {
    orderNo: string;        // Toss orderId 대응 ([A-Za-z0-9-_] 6~64 규격 충족)
    amount: number;         // 서버가 계산한 order.totalAmount (원)
    tradeNo: string | null; // Toss paymentKey 대응. mock은 null이면 자체 발급
  }): Promise<GatewayConfirmResult>;

  /** 결제 취소(환불). 실 PG 도입 시 구현 — mock은 즉시 성공. */
  cancel(input: { tradeNo: string; reason: string }): Promise<GatewayCancelResult>;
}

export type GatewayConfirmResult =
  | { ok: true; tradeNo: string; method: string; approvedAmount: number;
      approvedAt: string; rawRequest: unknown; rawResponse: unknown }
  | { ok: false; failMessage: string; rawRequest: unknown; rawResponse: unknown };
```

**MockPaymentGateway 동작**
- 기본 승인: `tradeNo = mock_${uuidv7()}` 발급, `method: "card"`, `approvedAmount = amount` 에코, raw 페이로드로 JSONB 컬럼을 실제로 채운다.
- 실패 마법값: `tradeNo === "mock_fail"`이면 거절(`failMessage: "모의 결제 거절"`) — dev 결제 페이지의 "실패 테스트" 버튼과 테스트가 사용.
- 스키마 매핑: `payment.provider ← gateway.provider`, `trade_no ← tradeNo`(partial unique), `raw_request/raw_response ← raw*`. **raw 페이로드는 DB 컬럼에만 — console 로깅 금지**(criterion 11).
- 실 PG 전환: `lib/payments/toss.ts` 추가 + `PAYMENT_PROVIDER=toss` + 결제 페이지의 `MockCheckout`을 위젯으로 교체 + `app/api/payments/webhook` 신설(룰 2가 허용하는 유일한 `app/api/` 용도). 도메인 액션은 무변경.
- env: `PAYMENT_PROVIDER`(optional, 기본 `"mock"`)를 `lib/env.ts`에 추가하고 `.env.local.example` 갱신.

## 모듈·라우트 배치

| 경로 | 역할 |
|---|---|
| `modules/cart/actions.ts` | `addCartItem` · `updateCartItemQuantity` · `removeCartItem` |
| `modules/cart/lib/{queries,schema,mock}.ts`, `types.ts` | 장바구니 쿼리(product 정보 DB 레벨 조인)·zod·mock 스토어·DTO |
| `modules/cart/components/` | `AddToCartButton`(상세 페이지 CTA), `CartButton`(헤더, 수량 뱃지), `CartView` |
| `modules/orders/actions.ts` | `placeOrder` · `confirmPayment` · `cancelOrder` · `updateDeliveryPolicy`(admin) |
| `modules/orders/lib/` | `queries` · `schema` · `order-no` · `amounts` · `stock` · `transform` · `mock` |
| `modules/orders/components/` | `CheckoutForm`, `PostcodeSearchField`, `MockCheckout`, `OrderSummary`, `OrderList`, `OrderDetail`, `OrderStatusBadge`, `DeliveryPolicyForm` |
| `lib/payments/` | 게이트웨이 포트 + mock 어댑터 + 팩토리 |
| `app/(shop)/cart/page.tsx` | `/cart` — 페이지 가드(`getCurrentAccount` → 없으면 `redirect("/login")`) |
| `app/(shop)/checkout/page.tsx` | `/checkout` — 배송지 입력 + 주문 요약 |
| `app/(shop)/checkout/[orderNo]/pay/page.tsx` | mock 결제 페이지(실 PG 위젯 자리). `pending`이 아니면 상세로 redirect |
| `app/(shop)/orders/page.tsx` | 주문 내역 목록 |
| `app/(shop)/orders/[orderNo]/page.tsx` | 주문 상세(아이템 스냅샷·배송지·결제 정보) |
| `app/(shop)/orders/[orderNo]/complete/page.tsx` | 결제 완료(주문번호·금액·상세 링크) |
| `app/(admin)/admin/settings/page.tsx` | 어드민 설정 — `DeliveryPolicyForm` (사이드바 "설정" 항목 추가) |

- `(shop)`은 optional auth이므로 회원 전용 페이지가 스스로 가드(routing.md 관례). 현 시점의 신원 프리미티브는 `getCurrentAccount()`(modules/auth/dal.ts, React `cache()`). 어드민 화면은 `(admin)/layout` 가드 + 액션 첫 줄 `requireAdmin()`(현 no-op이지만 구조 유지 — `deleteMember` 선례).
- URL 파라미터는 전부 `order_no`(외부 비즈니스 번호) — 내부 `id`는 노출하지 않는다. Next 16: `params`는 Promise, `await params`.
- 기존 스텁 교체: `ProductCTAPlaceholder` → `AddToCartButton`, `app/(shop)/_components/CartButton.tsx` → `modules/cart/components/CartButton.tsx`.

## 함수 시그니처

하우스 스타일: `schema.parse(input)` → `USE_MOCK_DATA` 분기 → `db.$transaction` → `revalidatePath` → DTO 반환 / 한국어 메시지 `throw new Error(...)`. 래퍼 타입(`ActionResult`) 없음. 모든 액션 첫 줄은 신원 가드.

```ts
// modules/cart/actions.ts
export async function addCartItem(input: CartItemAddInput): Promise<void>;
//  { productId: number; quantity: number }  — 존재·active·재고 소프트 체크(UX용, 확정은 confirmPayment)
//  기존 항목이면 수량 합산 upsert (unique(account_id, product_id) 활용, P2002 가드)
export async function updateCartItemQuantity(input: CartItemUpdateInput): Promise<void>;
export async function removeCartItem(input: { cartItemId: number }): Promise<void>;

// modules/cart/lib/queries.ts
export async function getCartItems(accountId: string): Promise<CartItemWithProduct[]>;
//  cart_item + product(name, salePrice, stockQuantity, saleStatus, itemType, condition)
//  + 썸네일(product_photo is_thumbnail=true) — 별도 findMany 후 메모리 조인(무관계 Prisma 하우스 패턴)
//  product가 삭제된 항목은 unavailable로 표시해 반환(정리 유도)
export async function getCartCount(accountId: string): Promise<number>; // 헤더 뱃지

// modules/orders/actions.ts
export async function placeOrder(input: CheckoutInput): Promise<{ orderNo: string }>;
//  CheckoutInput = { recipientName, recipientPhone, zipcode, baseAddress,
//                    detailAddress?, deliveryMessage?, expectedTotalAmount }
export async function confirmPayment(input: { orderNo: string; tradeNo?: string }): Promise<{ orderNo: string }>;
//  실패 시 throw(클라이언트 toast) — 서버는 이미 failed/canceled 반영(필요시 재고 복원)을 마친 뒤 던짐
export async function cancelOrder(input: { orderNo: string }): Promise<void>; // pending만, 재고 복원 없음
export async function updateDeliveryPolicy(input: DeliveryPolicyUpdateInput): Promise<void>; // requireAdmin()

// modules/orders/lib
export function generateOrderNo(): string;
//  `${yyyyMMdd}-${crypto random Crockford base32 10자}` 예: 20260704-8K3F9Q2M1D
//  시간 정렬성 + 추측 곤란 + Toss orderId 규격 충족. unique 충돌(P2002) 시 1회 재생성.
export function calculateOrderAmounts(
  items: Array<{ unitPrice: number; quantity: number }>,
  policy: { deliveryFee: number; freeThresholdAmount: number | null },
): OrderAmounts;
//  productAmount = Σ unitPrice×qty · discountAmount = 0(MVP)
//  deliveryAmount = (기준 충족 시 0, 아니면 deliveryFee) · totalAmount = product − discount + delivery
//  순수 함수 — 정책은 인자로 주입(테스트 용이). 배송비 정책 변경은 delivery_policy 행 수정만.
export async function getDeliveryPolicy(): Promise<DeliveryPolicy>;   // 1행. 없으면 fail-fast(설정 오류)
export async function getOrderByOrderNo(accountId: string, orderNo: string): Promise<OrderDetail | null>;
export async function listOrdersByAccount(accountId: string): Promise<OrderSummaryDto[]>;
```

## placeOrder / confirmPayment 트랜잭션

**placeOrder — tx#1** (재고 차감 없음, 네트워크 호출 없음)

```
가드: getCurrentAccount() 없으면 throw "로그인이 필요합니다"
검증: checkoutSchema.parse(input)
$transaction(async (tx) => {
  1. cart = tx.cartItem.findMany({ accountId })            — 비었으면 "장바구니가 비어 있습니다"
  2. products = tx.product.findMany({ id IN … })            — 스냅샷 소스 (가격·이름·유형·컨디션)
     · saleStatus !== 'active' 또는 stockQuantity < qty → 소프트 거부(확정 아님 — 최종은 tx#2)
  3. policy = delivery_policy 1행 로드
     amounts = calculateOrderAmounts(items, policy)          — 서버 재계산
     · amounts.totalAmount !== input.expectedTotalAmount → "가격이 변경되었습니다. 다시 확인해주세요"
  4. order INSERT        (orderNo = generateOrderNo(), status 'pending', amounts)
  5. order_item INSERT×n (product_name/thumbnail_key/item_type/condition/unit_price=salePrice/qty 스냅샷)
  6. order_address INSERT
  7. payment INSERT      (provider = gateway.provider, status 'ready', requestedAmount = totalAmount)
  8. order_status_history INSERT ('pending', status_changed_at = now)
  9. tx.cartItem.deleteMany({ accountId, productId IN 주문분 })
})
revalidatePath("/cart") · revalidatePath("/", "layout")      — 헤더 뱃지 갱신
return { orderNo }                                            — 클라이언트가 /checkout/[orderNo]/pay로 push
```

**confirmPayment** (선점 tx#2 → 게이트웨이 → 반영 tx#3)

```
가드: 본인 소유 order+payment 로드(orderNo 스코프: accountId 필수 조건)
멱등: order 'paid' && payment 'approved'면 { orderNo } 즉시 반환 (더블 클릭/재시도 안전)
검증: order.status === 'pending'

tx#2 — 선점 (배민 pay-approve-before 대응):
  a. UPDATE payment SET status='in_progress' WHERE id=? AND status='ready'
     · 0행 → 이미 다른 요청이 진행 중 → "결제가 진행 중입니다" (중복 결제 방지 락)
  b. decrementStock(tx, order_items)
     · SoldOutError → tx#2 롤백 후 보상 tx: payment 'failed'('품절') + order 'canceled' + history
       → throw "품절되었거나 판매가 종료된 상품입니다" (과금·복원 없음)

result = gateway.confirm({ orderNo, amount: order.totalAmount, tradeNo })   ◀ 트랜잭션 밖

성공 && result.approvedAmount === order.totalAmount:
  tx#3: payment → approved (tradeNo/method/approvedAmount/approvedAt/raw_*)
        order → paid + history INSERT
  revalidatePath(`/orders/${orderNo}`) · revalidatePath("/orders")
실패 (거절·금액 불일치·게이트웨이 예외):
  tx#3': payment → failed (fail_message, raw_*)
         order → canceled + history INSERT + restoreStock(tx, order_items)   ◀ 선점 보상
  throw new Error(failMessage)                               — 클라이언트 toast
```

**cancelOrder**: `pending` 검증 → tx: order `canceled` + payment(`ready`) `canceled` + history. **재고 복원 없음**(선점 전). `in_progress` 중엔 취소 불가("결제가 진행 중입니다").

## UI 컴포넌트 매핑 (디자인 시스템)

기존 shadcn 18종 + 하우스 패턴(클라이언트 폼 = `useTransition` + sonner toast + controlled `useState`, `useActionState` 미사용, Toaster는 페이지별 렌더, 이미지는 `ProductImage`식 `<img>` + `R2_PUBLIC_BASE` prop 스레딩, 가격 `₩{n.toLocaleString()}`)을 그대로 따른다.

| 컴포넌트 | 구성 |
|---|---|
| `AddToCartButton` | 수량 스테퍼(−/+, 재고 한도, 재고 1개면 생략) + `Button`(size lg, full-width) + `useTransition`. 비로그인은 prop으로 받아 `/login` push. 성공 `toast.success("장바구니에 담았습니다")` + "장바구니 보기" 액션 |
| `CartButton`(헤더) | 기존 스텁 자리. 아이콘 + 수량 `Badge` — `(shop)/layout`에서 `getCartCount` 조회해 prop |
| `CartView` | `Card` 리스트: 썸네일(aspect-square)·이름·단가, 수량 +/−(`Button` icon, 재고 한도 disabled), 삭제(`Button` ghost). 품절/판매종료 항목은 `text-destructive` 알림 + 삭제 유도. 무료 배송 기준 있으면 "○원 더 담으면 무료 배송" 넛지. 하단 합계 `Card` + "주문하기" `Button` |
| `CheckoutForm` | `Card` 2단: 배송지(수령인·연락처 `Input`, 우편번호·기본주소는 `PostcodeSearchField` 자동 채움 + readOnly, 상세주소·배송메모 수기) + `OrderSummary`(상품/배송비/합계). 제출 → `placeOrder` → `router.push` |
| `PostcodeSearchField` | Daum 우편번호 서비스 — `next/script`로 lazy 로드, 레이어로 열어 선택 시 zipcode/baseAddress 채움 |
| `MockCheckout` | 주문 요약 + [결제하기] `Button`(primary) + [주문 취소] `Button`(outline) + dev 전용 [실패 테스트] (`mock_fail` 전달). 결제 순간 품절 실패 시 toast + 주문 상세로 이동 |
| `OrderStatusBadge` | `Badge` variant 매핑 (paid=default, pending=secondary, canceled=destructive/outline) |
| `OrderList` / `OrderDetail` | 목록은 주문번호·일시(`formatKstDate`)·상태 뱃지·합계 `Card` 행; 상세는 아이템 스냅샷(주문 시점 썸네일 `product_thumbnail_key`)·배송지·결제 정보 |
| `DeliveryPolicyForm`(admin) | `Card` + `Input` 2개(기본 배송비·무료 기준, 빈값 = 제도 없음) — `TeamForm`과 동일한 폼 패턴 |
| 빈 상태 | 하우스 패턴: `rounded-md border bg-card p-12 text-center` — "장바구니가 비어 있습니다" + 홈 링크 |

## 보안 가드레일 → 설계 매핑

| security-review 기준 | 이 설계의 충족 |
|---|---|
| 10. mutation은 Server Action | 전 mutation이 `modules/{cart,orders}/actions.ts`. `app/api/`는 실 PG webhook 전용으로 예약 |
| 5. SQL 문자열 연결 금지 | 재고 차감은 `$executeRaw` 태그드 템플릿(파라미터라이즈드)만 |
| 11. raw 결제 데이터 로깅 금지 | raw_request/raw_response는 JSONB 컬럼에만, 로그 출력 금지 |
| 3·7. 시크릿 | mock은 시크릿 없음. 실 PG 키는 서버 전용 env(`lib/env.ts`) — `NEXT_PUBLIC_` 금지 |
| 6. 가드 제거 금지 | 어드민 배송비 액션은 `requireAdmin()` 첫 줄 유지, 회원 액션은 `getCurrentAccount` 가드 |
| 금액 변조 | 서버 재계산 + `expectedTotalAmount` 대조 + `approvedAmount === totalAmount` 검증. DB CHECK(비음수)가 백스톱 |
| 소유권 | 모든 조회·전이가 `accountId` 스코프(orderNo 단독 조회 금지). RLS(order_address·payment)는 경계 백스톱 |
| 12. 필수 테스트 | 아래 구현 순서의 테스트가 커밋 게이트 통과 조건 |

## 엣지 케이스

- **마지막 1개 동시 결제**: tx#2에서 한쪽만 UPDATE 성공, 다른 쪽은 0행 → 품절 처리(과금 없음). 결제 페이지 도달만으로는 확보가 아니다 — "결제 완료가 곧 확보".
- **placeOrder 더블 서브밋**: 버튼 pending disable + 첫 주문이 cart를 비우므로 두 번째는 "장바구니가 비어 있습니다"로 자연 차단.
- **confirmPayment 동시/중복**: `ready→in_progress` 조건부 UPDATE가 락 — 두 번째 요청은 "결제가 진행 중입니다". 완료 후 재클릭은 멱등 성공 반환. `trade_no` partial unique + `payment_order_unique`가 DB 백스톱.
- **결제 페이지 이탈(pending 방치)**: 재고를 잠그지 않으므로 무해 — 주문 내역에서 이어서 결제(그 사이 품절됐다면 tx#2가 거부)하거나 취소.
- **tx#2 커밋 후 서버 크래시**(선점 후 승인 반영 전): `in_progress` 잔존 + 재고 잠김 — 창은 초 단위·크래시 한정. 정리 배치("in_progress + n분 경과 → 복원 + failed/canceled")는 실 PG 만료 배치와 함께 후속. `in_progress` 상태가 이 잔존을 식별 가능하게 만드는 장치다.
- **장바구니 담은 뒤 가격·배송비 변경**: `expectedTotalAmount` 불일치로 거부 — 사용자가 새 금액 확인 후 재시도.
- **장바구니 상품이 삭제/판매종료됨**: `getCartItems`가 unavailable 표시, `placeOrder` 소프트 검증과 tx#2가 이중 방어.
- **수량 > 재고로 조절 시도**: UI에서 재고 한도 disable + 서버 zod/조건부 UPDATE가 이중 방어.

## 미해결 · 후속 (구현 전 확정 불필요, 도입 시점 명시)

1. **정리 배치** — `in_progress` 크래시 잔존 복원 + 오래된 `pending` 주문 정리. 실 PG 도입 시 만료 정책과 함께. (선점 방식 변경으로 "재고 해방" 목적의 시급성은 사라짐.)
2. **환불(paid 취소)** — `gateway.cancel` + `canceled_at`/부분취소 모델. 실 PG 시 어드민 화면과 함께.
3. **webhook 라우트**(`app/api/payments/webhook`) — 실 PG의 비동기 상태 통지(가상계좌 등) 수신용.
4. **app 롤 전환 시 GUC 주입** — order/payment 쓰기 `$transaction`을 lesson 16의 `set_config('app.current_account_id', …, true)` 래퍼로 감싼다(현재는 postgres owner 연결이라 RLS 미적용 경로).
5. **어드민 주문 관리**(shipped/delivered 전환, 수기 보정) — order_status_history가 이미 수용.
6. **바로구매·부분 선택 주문** — MVP는 장바구니 전체 주문.
7. **order_address 정정 경로** — 스키마 리뷰 때 플래그(immutable + unique(order_id) — 현재는 정정 불가).

## 구현 순서 (TDD)

테스트 정책: `actions.ts`는 3케이스(happy/권한 거부/zod 실패) 필수, `lib/*.ts`는 1:1 필수, `mock.ts`·presentational 컴포넌트는 면제. 테스트는 `tests/`가 src 미러링.

1. **문서 정비**: references.md에 결제 포트/어댑터 행 추가(Medusa·Vendure 출처), conventions.md에 `auth/dal` import 예외 명문화.
2. **스키마**: `init_order.sql` in-place 수정 — `delivery_policy` 테이블+시드+GRANT 추가(payment 상태는 TEXT라 `in_progress`에 스키마 변경 불필요). Prisma `DeliveryPolicy` 모델 추가 → `db:reset`으로 재적용(pre-launch 워크플로우).
3. **`lib/payments/`**: types → mock 어댑터(계약 테스트: 승인 에코·`mock_fail` 거절·raw 페이로드) → 팩토리. `env.ts`에 `PAYMENT_PROVIDER` + `.env.local.example` 갱신.
4. **`modules/orders` 기반 lib**: `types.ts`(상태 상수, `in_progress` 포함) · `order-no.ts`(형식 테스트) · `amounts.ts`(정책 주입 계산 테스트: 기준 미달/충족/제도 없음).
5. **`modules/cart`**: schema → mock → queries(테스트) → actions(3케이스 테스트).
6. **cart UI**: `AddToCartButton`(수량 스테퍼 포함)으로 `ProductCTAPlaceholder` 교체, 헤더 `CartButton` 활성화, `/cart` + `CartView`.
7. **`modules/orders/lib/stock.ts`**: tx 주입 단위 테스트(0행 → SoldOutError, 정렬 검증) → `transform.ts`.
8. **`placeOrder`**(3케이스 + 금액 불일치·빈 장바구니 테스트) → `/checkout` + `CheckoutForm` + `PostcodeSearchField`(Daum 우편번호).
9. **`confirmPayment`/`cancelOrder`**(멱등·중복 락·품절 보상·승인 실패 복원 테스트) → `/checkout/[orderNo]/pay` + `MockCheckout` → complete 페이지.
10. **주문 내역**: queries(테스트) → `/orders` 목록·상세.
11. **어드민 배송비 설정**: `getDeliveryPolicy`/`updateDeliveryPolicy`(3케이스 테스트) → `/admin/settings` + `DeliveryPolicyForm` + 사이드바 항목.
12. `pnpm validate`(lint+typecheck+test) → 커밋 분할(feat: cart / feat: order·payment / feat: admin 설정 / docs) → security-officer 리뷰.

## 참고

- 배민 참고 문서(Obsidian Vault/order) — **재고 선점 시점의 근거**: `POST /v1/pay/validate/pay-approve-before → 재고 선점(preemptStock)`, 주문서 생성은 비선점(Valkey 캐시), 미승인 시 재고 복원. 주문 생성/결제 승인 분리, pay 도메인 스냅샷 구조도 차용
- [Toss Payments 결제 연동 흐름](https://docs.tosspayments.com/guides/v2/payment-widget/integration) — confirm(paymentKey, orderId, amount) 계약과 READY→IN_PROGRESS→DONE 상태 흐름의 원형
- [medusajs/medusa — Payment Provider](https://github.com/medusajs/medusa) — `AbstractPaymentProvider` 포트/어댑터
- [vendure-ecommerce/vendure — dummyPaymentHandler](https://github.com/vendure-ecommerce/vendure) — 코어 내장 mock 어댑터 선례
- [Daum 우편번호 서비스](https://postcode.map.daum.net/guide) — 주소 입력 표준 위젯 (무료, 키 발급 불필요)
- Supabase Postgres Best Practices — `lock-short-transactions`(트랜잭션 밖 API 호출), `lock-deadlock-prevention`(정렬 잠금), `data-upsert`(단일문 원자성)
