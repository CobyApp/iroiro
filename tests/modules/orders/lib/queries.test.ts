import { beforeEach, describe, expect, it, vi } from "vitest";

const orderFindFirst = vi.fn();
const orderFindMany = vi.fn();
const itemFindMany = vi.fn();
const addressFindUnique = vi.fn();
const paymentFindUnique = vi.fn();
const policyFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    order: { findFirst: orderFindFirst, findMany: orderFindMany },
    orderItem: { findMany: itemFindMany },
    orderAddress: { findUnique: addressFindUnique },
    payment: { findUnique: paymentFindUnique },
    deliveryPolicy: { findUnique: policyFindUnique },
  },
}));

const ACCOUNT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function orderRow(data: Record<string, unknown> = {}) {
  return {
    id: 1n,
    orderNo: "20260701-ORDERA0001",
    accountId: ACCOUNT_A,
    status: "paid",
    productAmount: 10000,
    discountAmount: 0,
    deliveryAmount: 3000,
    totalAmount: 13000,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...data,
  };
}

function itemRow(data: Record<string, unknown> = {}) {
  return {
    id: 1n,
    orderId: 1n,
    productId: 10n,
    productName: "상품1",
    productThumbnailKey: null,
    itemType: "photocard",
    condition: null,
    unitPrice: 10000,
    quantity: 1,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...data,
  };
}

beforeEach(() => {
  vi.resetModules();
  orderFindFirst.mockReset().mockResolvedValue(null);
  orderFindMany.mockReset().mockResolvedValue([]);
  itemFindMany.mockReset().mockResolvedValue([]);
  addressFindUnique.mockReset().mockResolvedValue(null);
  paymentFindUnique.mockReset().mockResolvedValue(null);
  policyFindUnique.mockReset().mockResolvedValue(null);
});

describe("orders queries", () => {
  describe("listOrdersByAccount", () => {
    it("본인 스코프·최신순으로 조회하고 대표 상품명·종류 수를 붙인다", async () => {
      orderFindMany.mockResolvedValue([
        orderRow({ id: 2n, orderNo: "20260702-ORDERA0002" }),
        orderRow({ id: 1n, orderNo: "20260701-ORDERA0001" }),
      ]);
      itemFindMany.mockResolvedValue([
        itemRow({ id: 1n, orderId: 1n, productName: "상품1" }),
        itemRow({ id: 2n, orderId: 1n, productName: "상품2" }),
        itemRow({ id: 3n, orderId: 2n, productName: "상품3" }),
      ]);
      const { listOrdersByAccount } = await import(
        "@/modules/orders/lib/queries"
      );
      const orders = await listOrdersByAccount(ACCOUNT_A);

      expect(orderFindMany).toHaveBeenCalledWith({
        where: { accountId: ACCOUNT_A },
        orderBy: { createdAt: "desc" },
      });
      expect(orders).toHaveLength(2);
      const order1 = orders.find((o) => o.id === 1);
      expect(order1?.itemCount).toBe(2);
      expect(order1?.firstItemName).toBe("상품1");
    });

    it("주문이 없으면 아이템 조회 없이 빈 배열", async () => {
      const { listOrdersByAccount } = await import(
        "@/modules/orders/lib/queries"
      );
      expect(await listOrdersByAccount(ACCOUNT_A)).toEqual([]);
      expect(itemFindMany).not.toHaveBeenCalled();
    });
  });

  describe("getOrderByOrderNo", () => {
    it("accountId 스코프로 조회하고 아이템·주소·결제를 조립한다", async () => {
      orderFindFirst.mockResolvedValue(orderRow());
      itemFindMany.mockResolvedValue([itemRow(), itemRow({ id: 2n })]);
      addressFindUnique.mockResolvedValue({
        id: 1n,
        orderId: 1n,
        accountId: ACCOUNT_A,
        recipientName: "홍길동",
        recipientPhone: "010-0000-0000",
        zipcode: "06236",
        baseAddress: "서울시",
        detailAddress: null,
        deliveryMessage: null,
        createdAt: new Date("2026-07-01T00:00:00Z"),
      });
      paymentFindUnique.mockResolvedValue({
        id: 1n,
        orderId: 1n,
        accountId: ACCOUNT_A,
        orderNo: "20260701-ORDERA0001",
        provider: "mock",
        method: "card",
        status: "approved",
        requestedAmount: 13000,
        approvedAmount: 13000,
        tradeNo: "mock_x",
        approvedAt: new Date("2026-07-01T00:00:00Z"),
        canceledAt: null,
        failMessage: null,
        rawRequest: null,
        rawResponse: null,
        createdAt: new Date("2026-07-01T00:00:00Z"),
        updatedAt: new Date("2026-07-01T00:00:00Z"),
      });
      const { getOrderByOrderNo } = await import(
        "@/modules/orders/lib/queries"
      );
      const order = await getOrderByOrderNo(ACCOUNT_A, "20260701-ORDERA0001");

      expect(orderFindFirst).toHaveBeenCalledWith({
        where: { orderNo: "20260701-ORDERA0001", accountId: ACCOUNT_A },
      });
      expect(order?.items).toHaveLength(2);
      expect(order?.address?.recipientName).toBe("홍길동");
      expect(order?.payment?.status).toBe("approved");
    });

    it("스코프 밖(다른 계정) 주문은 null", async () => {
      const { getOrderByOrderNo } = await import(
        "@/modules/orders/lib/queries"
      );
      expect(
        await getOrderByOrderNo(ACCOUNT_A, "20260703-ORDERB0003"),
      ).toBeNull();
    });
  });

  describe("getDeliveryPolicy", () => {
    it("singleton 1행을 조회해 반환한다", async () => {
      policyFindUnique.mockResolvedValue({
        id: 1n,
        deliveryFee: 3000,
        freeThresholdAmount: null,
      });
      const { getDeliveryPolicy } = await import(
        "@/modules/orders/lib/queries"
      );
      const policy = await getDeliveryPolicy();

      expect(policyFindUnique).toHaveBeenCalledWith({ where: { id: 1n } });
      expect(policy).toEqual({ deliveryFee: 3000, freeThresholdAmount: null });
    });

    it("정책 행이 없으면 설정 오류로 fail-fast", async () => {
      const { getDeliveryPolicy } = await import(
        "@/modules/orders/lib/queries"
      );
      await expect(getDeliveryPolicy()).rejects.toThrow(/배송비 정책/);
    });
  });
});
