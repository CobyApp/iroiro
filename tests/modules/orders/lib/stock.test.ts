import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";

import {
  decrementStock,
  restoreStock,
  SoldOutError,
} from "@/modules/orders/lib/stock";

// $executeRaw 태그드 템플릿을 가짜로 구현 — 값 배열의 [0]=quantity, [1]=BigInt(productId).
function makeTx(results: number[]) {
  const calls: { productId: number; quantity: number }[] = [];
  let index = 0;
  const $executeRaw = vi.fn(
    (_strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({
        quantity: Number(values[0]),
        productId: Number(values[1]),
      });
      const result = results[index] ?? 1;
      index += 1;
      return Promise.resolve(result);
    },
  );
  return {
    tx: { $executeRaw } as unknown as Prisma.TransactionClient,
    calls,
  };
}

describe("decrementStock", () => {
  it("경매 낙찰자 조건이 UPDATE WHERE에 포함된다(만료 정산과의 경합 게이트)", async () => {
    let sql = "";
    const $executeRaw = (strings: TemplateStringsArray, ..._v: unknown[]) => {
      sql = strings.join("?");
      return Promise.resolve(1);
    };
    const tx = { $executeRaw } as unknown as Prisma.TransactionClient;
    await decrementStock(tx, [{ productId: 1, quantity: 1 }], ACCOUNT_ID);
    expect(sql).toContain("auction_status = 'awarded'");
    expect(sql).toContain("auction_winner_account_id");
    expect(sql).toContain("auction_pay_due_at");
    expect(sql).toContain("sale_mode = 'fixed'");
  });

  it("모든 라인이 성공하면 각각 1회씩 UPDATE한다", async () => {
    const { tx, calls } = makeTx([1, 1]);
    await decrementStock(tx, [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ], ACCOUNT_ID);
    expect(calls).toHaveLength(2);
  });

  it("product_id 오름차순으로 잠근다(데드락 방지)", async () => {
    const { tx, calls } = makeTx([1, 1, 1]);
    await decrementStock(tx, [
      { productId: 3, quantity: 1 },
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 1 },
    ], ACCOUNT_ID);
    expect(calls.map((c) => c.productId)).toEqual([1, 2, 3]);
  });

  it("영향 행이 0이면 SoldOutError(실패 productId 포함)를 던진다", async () => {
    const { tx } = makeTx([0]);
    await expect(
      decrementStock(tx, [{ productId: 7, quantity: 1 }], ACCOUNT_ID),
    ).rejects.toBeInstanceOf(SoldOutError);

    const { tx: tx2 } = makeTx([0]);
    await expect(
      decrementStock(tx2, [{ productId: 7, quantity: 1 }], ACCOUNT_ID),
    ).rejects.toMatchObject({ productId: 7 });
  });

  it("품절 지점 이후로는 UPDATE하지 않는다", async () => {
    const { tx, calls } = makeTx([1, 0, 1]);
    await expect(
      decrementStock(tx, [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 1 },
        { productId: 3, quantity: 1 },
      ], ACCOUNT_ID),
    ).rejects.toBeInstanceOf(SoldOutError);
    expect(calls).toHaveLength(2); // 3번째는 실행되지 않음
  });
});

describe("restoreStock", () => {
  it("조건 없이 모든 라인을 오름차순으로 증가시킨다", async () => {
    const { tx, calls } = makeTx([1, 1]);
    await restoreStock(tx, [
      { productId: 2, quantity: 1 },
      { productId: 1, quantity: 3 },
    ]);
    expect(calls.map((c) => c.productId)).toEqual([1, 2]);
    expect(calls).toHaveLength(2);
  });
});
