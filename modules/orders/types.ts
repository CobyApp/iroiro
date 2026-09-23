/**
 * 주문·결제 상태 어휘와 도메인 DTO 단일 진실 소스.
 * products/types.ts의 SALE_STATUS_LABEL 패턴을 따른다 — 라벨 맵이 진실,
 * 코드 배열·TS union은 자동 도출. 라벨 누락은 TS 컴파일 에러로 잡힌다.
 */

/**
 * 주문 상태 라이프사이클:
 *   pending  : 결제 대기 — 주문 생성됨, 아직 미결제(재고 미선점)
 *   paid     : 결제 완료 — 승인됨, 재고 차감 완료
 *   shipped  : 발송 완료 (어드민 전이, 후속)
 *   delivered: 배송 완료 (어드민 전이, 후속)
 *   canceled : 취소됨 (종결 — 재결제 없음, 다시 사려면 새 주문)
 */
export const ORDER_STATUS_LABEL = {
  pending: "결제 대기",
  paid: "결제 완료",
  shipped: "발송 완료",
  delivered: "배송 완료",
  canceled: "취소됨",
} as const satisfies Record<string, string>;

export type OrderStatus = keyof typeof ORDER_STATUS_LABEL;

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABEL) as [
  OrderStatus,
  ...OrderStatus[],
];

/**
 * 결제 상태 라이프사이클 (Toss READY→IN_PROGRESS→DONE 흐름과 정렬):
 *   ready       : 주문 생성 시 결제 준비 행 생성
 *   in_progress : 재고 선점 완료·승인 진행 중 (중복 결제 방지 락 + 크래시 잔존 식별)
 *   approved    : 승인 완료
 *   failed      : 승인 거절·금액 불일치 등 실패
 *   canceled    : 취소됨 (사용자 취소 또는 승인 후 환불)
 */
export const PAYMENT_STATUS_LABEL = {
  ready: "결제 준비",
  in_progress: "결제 진행 중",
  approved: "승인",
  failed: "실패",
  canceled: "취소됨",
} as const satisfies Record<string, string>;

export type PaymentStatus = keyof typeof PAYMENT_STATUS_LABEL;

export const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABEL) as [
  PaymentStatus,
  ...PaymentStatus[],
];

// 배송비 정책 DTO (delivery_policy 1행).
export type DeliveryPolicy = {
  deliveryFee: number;
  freeThresholdAmount: number | null;
};

// 주문 금액 4종 (전부 원 단위, 비음수).
export type OrderAmounts = {
  productAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  totalAmount: number;
};

// 주문 상품 스냅샷 (주문 시점 값 고정 — 이후 상품이 바뀌어도 불변).
export type OrderItem = {
  id: number;
  orderId: number;
  productId: number;
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  condition: string | null;
  unitPrice: number;
  quantity: number;
  createdAt: string;
};

export type OrderAddress = {
  id: number;
  orderId: number;
  recipientName: string;
  recipientPhone: string;
  zipcode: string;
  baseAddress: string;
  detailAddress: string | null;
  deliveryMessage: string | null;
  createdAt: string;
};

export type Payment = {
  id: number;
  orderId: number;
  orderNo: string;
  provider: string;
  method: string | null;
  status: PaymentStatus;
  requestedAmount: number;
  approvedAmount: number | null;
  tradeNo: string | null;
  approvedAt: string | null;
  canceledAt: string | null;
  failMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: number;
  orderNo: string;
  accountId: string;
  status: OrderStatus;
  productAmount: number;
  discountAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  trackingCode: string | null;
  courier: string | null;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// 목록 표시용 — 대표 상품명 + 상품 종류 수 + 대표 썸네일(첫 상품).
export type OrderSummary = Order & {
  itemCount: number;
  firstItemName: string | null;
  firstItemProductId: number | null;
  firstItemThumbnailKey: string | null;
};

// 상세 표시용 — 아이템 스냅샷 + 배송지 + 결제.
export type OrderDetail = Order & {
  items: OrderItem[];
  address: OrderAddress | null;
  payment: Payment | null;
};
