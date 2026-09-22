import { beforeEach, describe, expect, it, vi } from "vitest";

const { productFindMany, orderItemFindMany } = vi.hoisted(() => ({
  productFindMany: vi.fn(),
  orderItemFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    product: { findMany: productFindMany },
    orderItem: { findMany: orderItemFindMany },
  },
}));

import { listRecentTradePrices } from "@/modules/auction/lib/queries";

beforeEach(() => {
  vi.clearAllMocks();
  productFindMany.mockResolvedValue([{ id: 1n }]);
  orderItemFindMany.mockResolvedValue([
    { unitPrice: 3000, createdAt: new Date() },
  ]);
});

describe("listRecentTradePrices — 포즈(카드) 단위 매칭", () => {
  it("catalog_card_id 가 있으면 그 카드로만 매칭한다(포즈 구분)", async () => {
    await listRecentTradePrices({
      id: 10,
      catalogCardId: 55,
      itemCode: "IC-1",
      name: "마스다 아야노 · 크리스마스",
    });
    expect(productFindMany).toHaveBeenCalledWith({
      where: { catalogCardId: 55n },
      select: { id: true },
    });
  });

  it("카드 연결이 없으면 item_code 로 폴백한다", async () => {
    await listRecentTradePrices({
      id: 10,
      catalogCardId: null,
      itemCode: "IC-1",
      name: "이름",
    });
    expect(productFindMany).toHaveBeenCalledWith({
      where: { itemCode: "IC-1" },
      select: { id: true },
    });
  });

  it("카드·item_code 둘 다 없으면 이름으로 폴백한다", async () => {
    await listRecentTradePrices({
      id: 10,
      catalogCardId: null,
      itemCode: null,
      name: "이름",
    });
    expect(productFindMany).toHaveBeenCalledWith({
      where: { name: "이름" },
      select: { id: true },
    });
  });
});
