"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { type ActionResult, DomainError, parseActionInput, runAction } from "@/lib/action-result";
import { db } from "@/lib/db";
import { todayKstYmd } from "@/lib/datetime";
import { getPaymentGateway } from "@/lib/payments";
import { getCurrentAccount } from "@/modules/auth/dal";
import { requireDeliveryManager } from "@/modules/admin/lib/requireAdminSpace";
import { notify } from "@/modules/notifications/lib/notify";
// 교차 도메인: 주문 생성은 재고 스냅샷·장바구니 비우기를 한 트랜잭션에서 해야 하므로
// actions 레이어가 product/cart 테이블을 직접 다룬다(conventions 예외).
// 교차 도메인: 결제 승인 tx 안에서 컬렉션 보유 원장 적재를 원자화해야 하므로 tx client를 넘겨 호출.
import { materializeItems } from "@/modules/collection/lib/materialize";
import { calculateOrderAmounts } from "./lib/amounts";
import { rememberAddress } from "@/modules/addresses/lib/remember";
import { formatOrderNo } from "./lib/order-no";
import { decrementStock, restoreStock, SoldOutError } from "./lib/stock";
import {
  cancelOrderSchema,
  checkoutSchema,
  confirmPaymentSchema,
  deliveryPolicyUpdateSchema,
  type CancelOrderInput,
  type CheckoutInput,
  type CheckoutParsed,
  type ConfirmPaymentInput,
  type DeliveryPolicyUpdateInput,
} from "./lib/schema";
import type { DeliveryPolicy } from "./types";

// ready→in_progress 조건부 전이 실패(다른 요청이 이미 진행 중) — 중복 결제 방지.
class PaymentInProgressError extends Error {
  constructor() {
    super("결제가 이미 진행 중입니다");
    this.name = "PaymentInProgressError";
  }
}

async function requireAccountId(): Promise<string> {
  const account = await getCurrentAccount();
  // 회원 액션의 로그인 가드 — 세션 만료는 정상적 예상 상황이므로 사용자에게 안내 메시지를
  // 보여준다(DomainError). (admin 전용 requireAdmin은 레이아웃 게이트 뒤라 도달=이상 → 그대로 throw.)
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account.id;
}

// ── placeOrder (tx#1) — 주문 생성. 재고는 차감하지 않는다(승인 직전 선점). ──────────

export async function placeOrder(
  input: CheckoutInput,
): Promise<ActionResult<{ orderNo: string }>> {
  return runAction(async () => {
    const data = parseActionInput(checkoutSchema, input);
    const accountId = await requireAccountId();
    const provider = getPaymentGateway().provider;

    const orderNo = await nextOrderNo();
    await db.$transaction((tx) =>
      placeOrderTx(tx, accountId, data, provider, orderNo),
    );
    revalidatePath("/cart");
    return { orderNo };
  });
}

// 주문번호 채번 — order_no_seq에 원자적 upsert(독립 autocommit)로 당일 시퀀스를 발급한다.
// 주문 트랜잭션 밖에서 실행해 카운터 행 잠금을 최소로 잡는다(핫 카운터 보호). 자정(KST)이
// 지나면 새 날짜 행이 생겨 시퀀스가 1부터 리셋된다. 발급 후 주문 tx가 실패하면 그 번호는
// 건너뛴다(gap 정상). 유일성은 (날짜+당일 시퀀스) + order_order_no_unique 백스톱.
async function nextOrderNo(): Promise<string> {
  const kstYmd = todayKstYmd();
  const rows = await db.$queryRaw<{ seq: bigint }[]>`
    INSERT INTO order_no_seq (seq_date, seq)
    VALUES (${kstYmd}::date, 1)
    ON CONFLICT (seq_date)
    DO UPDATE SET seq = order_no_seq.seq + 1, updated_at = now()
    RETURNING seq
  `;
  return formatOrderNo(rows[0].seq, kstYmd);
}

async function placeOrderTx(
  tx: Prisma.TransactionClient,
  accountId: string,
  data: CheckoutParsed,
  provider: string,
  orderNo: string,
): Promise<void> {
  // 선택 주문 — 장바구니에서 고른 항목만. 빈 배열(구버전/미선택)이면 전체.
  const selectedIds = data.cartItemIds.map((id) => BigInt(id));
  const cart = await tx.cartItem.findMany({
    where: {
      accountId,
      ...(selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
  });
  if (cart.length === 0) {
    throw new DomainError(
      selectedIds.length > 0
        ? "주문할 상품을 선택해주세요"
        : "장바구니가 비어 있습니다",
    );
  }

  const productIds = cart.map((item) => item.productId);
  const [products, thumbnails, policyRow] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds } } }),
    tx.productPhoto.findMany({
      where: { productId: { in: productIds }, isThumbnail: true },
      select: { productId: true, r2Key: true },
    }),
    tx.deliveryPolicy.findUnique({ where: { id: BigInt(1) } }),
  ]);
  // 운영 설정 누락 = 시스템/설정 오류(사용자 표시용 예상 오류 아님) → error boundary.
  if (!policyRow) throw new Error("배송비 정책이 설정되지 않았습니다");

  const productById = new Map(products.map((product) => [product.id, product]));
  const thumbByProduct = new Map(
    thumbnails.map((thumb) => [thumb.productId, thumb.r2Key]),
  );

  const snapshots = cart.map((item) => {
    const product = productById.get(item.productId);
    if (!product || product.saleStatus !== "active") {
      throw new DomainError("판매가 종료된 상품이 포함되어 있습니다");
    }
    if (item.quantity > product.stockQuantity) {
      throw new DomainError("재고가 부족한 상품이 포함되어 있습니다");
    }
    // 경매 상품 — 낙찰자 본인 + 결제 기한 내에만 주문 생성(최종 게이트는 decrementStock).
    if (product.saleMode === "auction") {
      const withinWindow =
        product.auctionStatus === "awarded" &&
        product.auctionWinnerAccountId === accountId &&
        product.auctionPayDueAt !== null &&
        new Date(product.auctionPayDueAt).getTime() > Date.now();
      if (!withinWindow) {
        throw new DomainError(
          "경매 결제 기한이 지났거나 낙찰자가 아닌 상품이 포함되어 있습니다",
        );
      }
      if (item.quantity !== 1) {
        throw new DomainError("경매 상품은 1개만 구매할 수 있습니다");
      }
    }
    return { product, quantity: item.quantity };
  });

  const policy: DeliveryPolicy = {
    deliveryFee: policyRow.deliveryFee,
    freeThresholdAmount: policyRow.freeThresholdAmount,
  };
  const productAmount = snapshots.reduce(
    (sum, s) => sum + s.product.salePrice * s.quantity,
    0,
  );

  // 포인트·쿠폰 검증 — 계정 행 잠금으로 동시 주문 간 이중 사용을 직렬화한다.
  let couponId: bigint | null = null;
  if (data.usePoints > 0 || data.useFreeShippingCoupon) {
    await tx.$queryRaw`SELECT id FROM account WHERE id = ${accountId}::uuid FOR UPDATE`;
  }
  if (data.usePoints > 0) {
    if (data.usePoints > productAmount) {
      throw new DomainError("포인트는 상품 금액까지만 사용할 수 있습니다");
    }
    const agg = await tx.pointTransaction.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });
    if (data.usePoints > (agg._sum.amount ?? 0)) {
      throw new DomainError("보유 포인트가 부족합니다");
    }
  }
  if (data.useFreeShippingCoupon) {
    const coupon = await tx.accountCoupon.findFirst({
      where: {
        accountId,
        kind: "free_shipping",
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!coupon) {
      throw new DomainError("사용 가능한 무료배송 쿠폰이 없습니다");
    }
    couponId = coupon.id;
  }

  const amounts = calculateOrderAmounts(
    snapshots.map((s) => ({
      unitPrice: s.product.salePrice,
      quantity: s.quantity,
    })),
    policy,
    {
      pointsUsed: data.usePoints,
      freeShippingCoupon: data.useFreeShippingCoupon,
    },
  );
  if (amounts.totalAmount !== data.expectedTotalAmount) {
    throw new DomainError("가격이 변경되었습니다. 다시 확인해주세요");
  }

  const order = await tx.order.create({
    data: {
      orderNo,
      accountId,
      status: "pending",
      productAmount: amounts.productAmount,
      discountAmount: amounts.discountAmount,
      deliveryAmount: amounts.deliveryAmount,
      totalAmount: amounts.totalAmount,
    },
  });

  await tx.orderItem.createMany({
    data: snapshots.map((s) => ({
      orderId: order.id,
      productId: s.product.id,
      productName: s.product.name,
      productThumbnailKey: thumbByProduct.get(s.product.id) ?? null,
      itemType: s.product.itemType,
      condition: s.product.condition,
      unitPrice: s.product.salePrice,
      quantity: s.quantity,
    })),
  });

  await tx.orderAddress.create({
    data: {
      orderId: order.id,
      accountId,
      recipientName: data.recipientName,
      recipientPhone: data.recipientPhone,
      zipcode: data.zipcode,
      baseAddress: data.baseAddress,
      detailAddress: data.detailAddress ?? null,
      deliveryMessage: data.deliveryMessage ?? null,
    },
  });

  await tx.payment.create({
    data: {
      orderId: order.id,
      accountId,
      orderNo,
      provider,
      status: "ready",
      requestedAmount: amounts.totalAmount,
    },
  });

  await tx.orderStatusHistory.create({
    data: { orderId: order.id, status: "pending", statusChangedAt: new Date() },
  });

  // 포인트 차감·쿠폰 소진 — 주문 id 확보 후 같은 tx에서 원자 기록.
  if (data.usePoints > 0) {
    await tx.pointTransaction.create({
      data: {
        accountId,
        amount: -data.usePoints,
        reason: "order_use",
        orderId: order.id,
        memo: `주문 ${orderNo} 사용`,
      },
    });
  }
  if (couponId !== null) {
    const used = await tx.accountCoupon.updateMany({
      where: { id: couponId, usedAt: null },
      data: { usedAt: new Date(), usedOrderId: order.id },
    });
    if (used.count === 0) {
      throw new DomainError("사용 가능한 무료배송 쿠폰이 없습니다");
    }
  }

  // 주문한 항목만 장바구니에서 비운다(선택 주문). 선택이 없으면(전체 주문) 계정 전체.
  await tx.cartItem.deleteMany({
    where: {
      accountId,
      ...(selectedIds.length > 0 ? { id: { in: selectedIds } } : {}),
    },
  });

  // 이번 배송지를 주소록에 자동 저장·최근 배송지로 승격(다음 결제에 자동 채움).
  await rememberAddress(tx, accountId, {
    recipientName: data.recipientName,
    recipientPhone: data.recipientPhone,
    zipcode: data.zipcode,
    baseAddress: data.baseAddress,
    detailAddress: data.detailAddress ?? null,
  });
}

// 주문이 취소로 끝날 때 포인트 환급 + 쿠폰 복원 — 취소 tx 안에서 호출.
// point_tx_order_refund_once(부분 유니크)가 이중 환급 백스톱.
async function refundOrderBenefits(
  tx: Prisma.TransactionClient,
  orderId: bigint,
  accountId: string,
): Promise<void> {
  const [useRow, refundRow] = await Promise.all([
    tx.pointTransaction.findFirst({
      where: { orderId, reason: "order_use" },
      select: { amount: true },
    }),
    tx.pointTransaction.findFirst({
      where: { orderId, reason: "order_refund" },
      select: { id: true },
    }),
  ]);
  if (useRow && !refundRow) {
    await tx.pointTransaction.create({
      data: {
        accountId,
        amount: -useRow.amount,
        reason: "order_refund",
        orderId,
        memo: "주문 취소 환급",
      },
    });
  }
  await tx.accountCoupon.updateMany({
    where: { usedOrderId: orderId },
    data: { usedAt: null, usedOrderId: null },
  });
}

// ── confirmPayment — 재고 선점(tx#2) → 게이트웨이 confirm(트랜잭션 밖) → 승인 반영(tx#3) ──

function revalidateOrder(orderNo: string): void {
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderNo}`);
}

export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<ActionResult<{ orderNo: string }>> {
  return runAction(() => confirmPaymentImpl(input));
}

// 본문이 커서 runAction 콜백으로 추출 — 내부 throw(DomainError)는 결과로 변환된다.
async function confirmPaymentImpl(
  input: ConfirmPaymentInput,
): Promise<{ orderNo: string }> {
  const data = parseActionInput(confirmPaymentSchema, input);
  const accountId = await requireAccountId();
  const gateway = getPaymentGateway();

  const order = await db.order.findFirst({
    where: { orderNo: data.orderNo, accountId },
  });
  if (!order) throw new DomainError("주문을 찾을 수 없습니다");
  const payment = await db.payment.findUnique({ where: { orderId: order.id } });
  if (!payment) throw new DomainError("결제 정보를 찾을 수 없습니다");

  // 멱등 — 이미 완료된 결제는 재시도해도 성공 반환(더블 클릭·재시도 안전).
  if (order.status === "paid" && payment.status === "approved") {
    return { orderNo: order.orderNo };
  }
  if (order.status !== "pending") {
    throw new DomainError("결제할 수 없는 주문입니다");
  }

  const items = await db.orderItem.findMany({
    where: { orderId: order.id },
    select: { productId: true, quantity: true },
  });
  const stockLines = items.map((item) => ({
    productId: Number(item.productId),
    quantity: item.quantity,
  }));

  // tx#2 — 선점: payment ready→in_progress(조건부 = 중복 결제 락) + 재고 차감.
  try {
    await db.$transaction(async (tx) => {
      const locked = await tx.payment.updateMany({
        where: { id: payment.id, status: "ready" },
        data: { status: "in_progress", updatedAt: new Date() },
      });
      if (locked.count === 0) throw new PaymentInProgressError();
      await decrementStock(tx, stockLines, order.accountId);
    });
  } catch (error) {
    if (error instanceof PaymentInProgressError) {
      throw new DomainError("결제가 이미 진행 중입니다");
    }
    if (error instanceof SoldOutError) {
      // 품절: 차감이 롤백됐으므로 복원 불필요. 결제 실패 + 주문 취소만.
      await db.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "failed", failMessage: "품절", updatedAt: new Date() },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: "canceled", updatedAt: new Date() },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: "canceled",
            statusChangedAt: new Date(),
          },
        });
        await refundOrderBenefits(tx, order.id, order.accountId);
      });
      revalidateOrder(order.orderNo);
      throw new DomainError("품절되었거나 판매가 종료된 상품입니다");
    }
    throw error;
  }

  // 게이트웨이 호출 — 반드시 트랜잭션 밖(네트워크 호출 중 락 보유 금지).
  const result = await gateway.confirm({
    orderNo: order.orderNo,
    amount: order.totalAmount,
    tradeNo: data.tradeNo ?? payment.tradeNo,
  });
  const approved = result.ok && result.approvedAmount === order.totalAmount;

  if (approved && result.ok) {
    // 보유 원장 스냅샷 재료 — order_item(이름/썸네일/유형/수량) + product(team/member).
    const orderItems = await db.orderItem.findMany({
      where: { orderId: order.id },
      select: {
        id: true,
        productId: true,
        quantity: true,
        productName: true,
        productThumbnailKey: true,
        itemType: true,
      },
    });
    const products = await db.product.findMany({
      where: { id: { in: orderItems.map((i) => i.productId) } },
      select: { id: true, teamId: true, memberId: true },
    });
    const teamMemberById = new Map(products.map((p) => [p.id, p]));
    const approvedAt = new Date(result.approvedAt);

    // tx#3 — 승인 반영 + 컬렉션 보유 원장 적재(원자적·멱등).
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "approved",
          tradeNo: result.tradeNo,
          method: result.method,
          approvedAmount: result.approvedAmount,
          approvedAt,
          rawRequest: result.rawRequest as Prisma.InputJsonValue,
          rawResponse: result.rawResponse as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "paid", updatedAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: "paid", statusChangedAt: new Date() },
      });
      await materializeItems(
        tx,
        order.accountId,
        orderItems.map((i) => ({
          productId: i.productId,
          orderItemId: i.id,
          quantity: i.quantity,
          productName: i.productName,
          productThumbnailKey: i.productThumbnailKey,
          itemType: i.itemType,
          teamId: teamMemberById.get(i.productId)?.teamId ?? null,
          memberId: teamMemberById.get(i.productId)?.memberId ?? null,
        })),
        approvedAt,
      );
    });
    // 결제 완료 알림 — 실패해도 결제 흐름엔 영향 없음(notify 내부에서 삼킴).
    await notify(accountId, {
      type: "order_paid",
      title: "주문이 완료됐어요",
      body: `주문번호 ${order.orderNo} — 결제가 확인되어 배송을 준비할게요.`,
      link: `/orders/${order.orderNo}`,
    });
    revalidateOrder(order.orderNo);
    return { orderNo: order.orderNo };
  }

  // 실패(거절·금액 불일치): 결제 failed + 주문 취소 + 재고 복원.
  const failMessage = result.ok
    ? "승인 금액이 주문 금액과 일치하지 않습니다"
    : result.failMessage;
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "failed",
        failMessage,
        rawRequest: result.rawRequest as Prisma.InputJsonValue,
        rawResponse: result.rawResponse as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { status: "canceled", updatedAt: new Date() },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "canceled",
        statusChangedAt: new Date(),
      },
    });
    await restoreStock(tx, stockLines);
    await refundOrderBenefits(tx, order.id, order.accountId);
  });
  revalidateOrder(order.orderNo);
  throw new DomainError(failMessage);
}

// ── cancelOrder — pending 주문만. 선점 전이므로 재고 복원 불필요. ──────────────────

export async function cancelOrder(
  input: CancelOrderInput,
): Promise<ActionResult> {
  return runAction(() => cancelOrderImpl(input));
}

async function cancelOrderImpl(input: CancelOrderInput): Promise<void> {
  const data = parseActionInput(cancelOrderSchema, input);
  const accountId = await requireAccountId();

  const order = await db.order.findFirst({
    where: { orderNo: data.orderNo, accountId },
  });
  if (!order) throw new DomainError("주문을 찾을 수 없습니다");
  if (order.status !== "pending") throw new DomainError("취소할 수 없는 주문입니다");

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "canceled", updatedAt: new Date() },
    });
    await tx.payment.updateMany({
      where: { orderId: order.id },
      data: { status: "canceled", canceledAt: new Date(), updatedAt: new Date() },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "canceled",
        statusChangedAt: new Date(),
      },
    });
    await refundOrderBenefits(tx, order.id, order.accountId);
  });
  revalidateOrder(order.orderNo);
}

// ── advanceOrderStatus — 어드민 주문 상태 전이 (paid→shipped→delivered). ──────────

const ADMIN_ORDER_TRANSITIONS: Record<string, "shipped" | "delivered"> = {
  paid: "shipped",
  shipped: "delivered",
};

export async function advanceOrderStatus(input: {
  orderNo: string;
}): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    await requireDeliveryManager();
    const data = parseActionInput(cancelOrderSchema, input);

    const order = await db.order.findFirst({
      where: { orderNo: data.orderNo },
    });
    if (!order) throw new DomainError("주문을 찾을 수 없습니다");
    const next = ADMIN_ORDER_TRANSITIONS[order.status];
    if (!next) throw new DomainError("전이할 수 없는 주문 상태입니다");

    // 조건부 updateMany — 동시 클릭·다른 전이와 경합 시 0행이면 거부(중복 전이 방지).
    await db.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: next, updatedAt: new Date() },
      });
      if (updated.count === 0) {
        throw new DomainError("주문 상태가 이미 변경되었습니다. 새로고침해주세요");
      }
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: next, statusChangedAt: new Date() },
      });
    });

    // 배송 알림 — 실패해도 전이엔 영향 없음(notify 내부에서 삼킴).
    await notify(
      order.accountId,
      next === "shipped"
        ? {
            type: "order_shipped",
            title: "주문하신 카드가 출발했어요",
            body: `주문번호 ${order.orderNo} — 발송이 완료됐어요. 곧 만나요!`,
            link: `/orders/${order.orderNo}`,
          }
        : {
            type: "order_delivered",
            title: "배송이 완료됐어요",
            body: `주문번호 ${order.orderNo} — 잘 도착했나요? 도착 인증 리뷰를 남겨보세요.`,
            link: `/orders/${order.orderNo}`,
          },
    );
    revalidateOrder(order.orderNo);
    revalidatePath("/admin/store/orders");
    return { status: next };
  });
}

// ── updateDeliveryPolicy — 어드민 배송비 정책 수정 (singleton 1행). ─────────────────

export async function updateDeliveryPolicy(
  input: DeliveryPolicyUpdateInput,
): Promise<ActionResult> {
  return runAction(() => updateDeliveryPolicyImpl(input));
}

async function updateDeliveryPolicyImpl(
  input: DeliveryPolicyUpdateInput,
): Promise<void> {
  await requireDeliveryManager();
  const data = parseActionInput(deliveryPolicyUpdateSchema, input);

  await db.deliveryPolicy.update({
    where: { id: BigInt(1) },
    data: {
      deliveryFee: data.deliveryFee,
      freeThresholdAmount: data.freeThresholdAmount,
      updatedAt: new Date(),
    },
  });
  revalidatePath("/cart");
}
