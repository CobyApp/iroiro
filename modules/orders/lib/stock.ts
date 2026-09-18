import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * 재고 선점 실패(품절/판매종료). confirmPayment의 선점 트랜잭션(tx#2)을 롤백시킨다.
 * 실패한 productId를 담아 상위에서 어떤 상품이 문제인지 식별 가능.
 */
export class SoldOutError extends Error {
  readonly productId: number;

  constructor(productId: number) {
    super("품절되었거나 판매가 종료된 상품입니다");
    this.name = "SoldOutError";
    this.productId = productId;
  }
}

export type StockLine = { productId: number; quantity: number };

/**
 * 재고를 원자적 조건부 UPDATE로 선점한다(결제 승인 직전 = 배민 pay-approve-before).
 * 트랜잭션 클라이언트를 주입받는 순수 함수 — 단위 테스트 가능.
 *
 * - 재고·판매상태 조건을 단일 UPDATE의 WHERE에 넣어 동시성에서 음수 유실 없음
 *   (PG READ COMMITTED 재평가). product_stock_non_negative CHECK가 최후 백스톱.
 * - 영향 행 0 = 품절 또는 판매종료 → SoldOutError로 트랜잭션 전체 롤백.
 * - 데드락 방지: 항상 product_id 오름차순으로 잠근다(멀티 상품 주문).
 * - $executeRaw 태그드 템플릿 = 파라미터라이즈드(문자열 연결 금지).
 */
export async function decrementStock(
  tx: Prisma.TransactionClient,
  lines: StockLine[],
  accountId: string,
): Promise<void> {
  const sorted = [...lines].sort((a, b) => a.productId - b.productId);
  for (const line of sorted) {
    // 경매 상품은 "낙찰(awarded) 상태 + 이 주문의 계정이 낙찰자"일 때만 선점 허용.
    // 결제 기한 만료 정산(passed 전환)과 경합해도 행 잠금 재평가로 한쪽만 이긴다:
    // 결제가 먼저면 재고 0이 되어 만료 정산이 건너뛰고, 만료가 먼저면 여기서
    // 조건 불일치(0행) → SoldOutError → 주문 취소·재고 복원 경로를 탄다.
    const affected = await tx.$executeRaw`
      UPDATE product
      SET stock_quantity = stock_quantity - ${line.quantity},
          updated_at = now()
      WHERE id = ${BigInt(line.productId)}
        AND sale_status = 'active'
        AND stock_quantity >= ${line.quantity}
        AND (
          sale_mode = 'fixed'
          OR (
            auction_status = 'awarded'
            AND auction_winner_account_id = ${accountId}::uuid
            AND (auction_pay_due_at IS NULL OR auction_pay_due_at > now())
          )
        )`;
    if (affected === 0) throw new SoldOutError(line.productId);
  }
}

/**
 * 선점 보상 — 승인 실패·주문 취소 시 재고를 되돌린다.
 * 단순 증가라 조건 불필요(CHECK 위반 불가). 정렬은 동일하게 유지.
 */
export async function restoreStock(
  tx: Prisma.TransactionClient,
  lines: StockLine[],
): Promise<void> {
  const sorted = [...lines].sort((a, b) => a.productId - b.productId);
  for (const line of sorted) {
    await tx.$executeRaw`
      UPDATE product
      SET stock_quantity = stock_quantity + ${line.quantity},
          updated_at = now()
      WHERE id = ${BigInt(line.productId)}`;
  }
}
