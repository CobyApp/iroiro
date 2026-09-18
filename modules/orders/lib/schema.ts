import { z } from "zod";

// 체크아웃 입력 — 배송지 + 클라이언트가 본 결제 예정 금액(서버 재계산과 대조).
export const checkoutSchema = z.object({
  recipientName: z.string().trim().min(1, "수령인을 입력해주세요").max(50),
  recipientPhone: z.string().trim().min(1, "연락처를 입력해주세요").max(20),
  zipcode: z.string().trim().min(1, "우편번호를 입력해주세요").max(10),
  baseAddress: z.string().trim().min(1, "주소를 입력해주세요").max(200),
  detailAddress: z.string().trim().max(200).nullable().optional(),
  deliveryMessage: z.string().trim().max(200).nullable().optional(),
  // 서버 계산과 다르면 "가격 변경"으로 거부(조용한 금액 변조 방지).
  expectedTotalAmount: z.number().int().nonnegative(),
  // 포인트 사용액(원) — 서버가 잔액·상품금액 한도를 재검증한다.
  usePoints: z.number().int().nonnegative().default(0),
  // 무료배송 쿠폰 사용 — 서버가 보유 쿠폰 중 가장 오래된 것을 골라 소진한다.
  useFreeShippingCoupon: z.boolean().default(false),
});

// z.input — usePoints/useFreeShippingCoupon는 default가 있어 호출자는 생략 가능.
export type CheckoutInput = z.input<typeof checkoutSchema>;
// z.output — 파싱 후(default 적용)의 타입. 서버 내부 로직용.
export type CheckoutParsed = z.output<typeof checkoutSchema>;

// 결제 승인 요청. tradeNo는 실 PG의 paymentKey 대응(mock은 마법값 mock_fail로 실패 유도).
export const confirmPaymentSchema = z.object({
  orderNo: z.string().min(1),
  tradeNo: z.string().nullable().optional(),
});

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

export const cancelOrderSchema = z.object({
  orderNo: z.string().min(1),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

// 배송비 정책 수정(어드민). 무료 기준은 비우면(null) 무료 배송 제도 없음.
export const deliveryPolicyUpdateSchema = z.object({
  deliveryFee: z.number().int().nonnegative(),
  freeThresholdAmount: z.number().int().nonnegative().nullable(),
});

export type DeliveryPolicyUpdateInput = z.infer<
  typeof deliveryPolicyUpdateSchema
>;
