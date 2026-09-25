import { describe, expect, it } from "vitest";
import {
  canBuyerCancelForRefund,
  canSellerCancelForRefund,
  canSellerShip,
  canSellerMarkHandedOver,
  canBuyerConfirm,
  canBuyerDispute,
  isAutoConfirmDue,
  isDirectAutoRefundDue,
  DIRECT_AUTO_CONFIRM_MS,
  PARCEL_AUTO_CONFIRM_MS,
  DIRECT_AUTO_REFUND_MS,
} from "@/modules/used/lib/trade-policy";

describe("취소·환불 가능 판정", () => {
  it("결제완료(미발송/미전달)면 구매자·판매자 모두 취소=환불 가능", () => {
    expect(canBuyerCancelForRefund("paid")).toBe(true);
    expect(canSellerCancelForRefund("paid")).toBe(true);
  });
  it("발송/전달 후에는 취소=환불 불가(분쟁으로만)", () => {
    for (const s of ["shipped", "handed_over", "completed", "refunded", "canceled"] as const) {
      expect(canBuyerCancelForRefund(s)).toBe(false);
      expect(canSellerCancelForRefund(s)).toBe(false);
    }
  });
  it("pending(결제 전)은 환불 대상 아님(취소 흐름은 별도)", () => {
    expect(canBuyerCancelForRefund("pending")).toBe(false);
  });
});

describe("판매자 발송/전달 표시", () => {
  it("택배는 결제완료에서 발송 표시 가능, 직거래는 불가", () => {
    expect(canSellerShip("parcel", "paid")).toBe(true);
    expect(canSellerShip("direct", "paid")).toBe(false);
    expect(canSellerShip("parcel", "shipped")).toBe(false);
  });
  it("직거래는 결제완료에서 전달 표시 가능, 택배는 불가", () => {
    expect(canSellerMarkHandedOver("direct", "paid")).toBe(true);
    expect(canSellerMarkHandedOver("parcel", "paid")).toBe(false);
  });
});

describe("구매자 수령확정", () => {
  it("택배는 발송 후 확정", () => {
    expect(canBuyerConfirm("parcel", "shipped")).toBe(true);
    expect(canBuyerConfirm("parcel", "paid")).toBe(false);
  });
  it("직거래는 결제완료 또는 전달표시 후 확정(만나서 받으면 바로)", () => {
    expect(canBuyerConfirm("direct", "paid")).toBe(true);
    expect(canBuyerConfirm("direct", "handed_over")).toBe(true);
  });
  it("완료/환불/취소 상태에서는 확정 불가", () => {
    for (const s of ["completed", "refunded", "canceled"] as const) {
      expect(canBuyerConfirm("parcel", s)).toBe(false);
      expect(canBuyerConfirm("direct", s)).toBe(false);
    }
  });
});

describe("분쟁", () => {
  it("발송/전달 후에만 분쟁 접수 가능", () => {
    expect(canBuyerDispute("parcel", "shipped")).toBe(true);
    expect(canBuyerDispute("direct", "handed_over")).toBe(true);
    expect(canBuyerDispute("parcel", "paid")).toBe(false);
    expect(canBuyerDispute("direct", "paid")).toBe(false);
    expect(canBuyerDispute("parcel", "completed")).toBe(false);
  });
});

describe("자동확정 타이머", () => {
  const now = new Date("2026-09-25T00:00:00Z");
  it("택배: 발송 7일 경과 시 자동확정", () => {
    const old = new Date(now.getTime() - PARCEL_AUTO_CONFIRM_MS - 1000);
    const fresh = new Date(now.getTime() - PARCEL_AUTO_CONFIRM_MS + 1000);
    expect(isAutoConfirmDue("parcel", { status: "shipped", shippedAt: old, handedOverAt: null }, now)).toBe(true);
    expect(isAutoConfirmDue("parcel", { status: "shipped", shippedAt: fresh, handedOverAt: null }, now)).toBe(false);
    expect(isAutoConfirmDue("parcel", { status: "shipped", shippedAt: null, handedOverAt: null }, now)).toBe(false);
  });
  it("직거래: 전달 3일 경과 시 자동확정", () => {
    const old = new Date(now.getTime() - DIRECT_AUTO_CONFIRM_MS - 1000);
    expect(isAutoConfirmDue("direct", { status: "handed_over", shippedAt: null, handedOverAt: old }, now)).toBe(true);
    expect(isAutoConfirmDue("direct", { status: "paid", shippedAt: null, handedOverAt: null }, now)).toBe(false);
  });
});

describe("직거래 자동환불 타이머", () => {
  const now = new Date("2026-09-25T00:00:00Z");
  it("전달표시 없이 14일 경과한 결제완료 직거래는 자동환불 대상", () => {
    const old = new Date(now.getTime() - DIRECT_AUTO_REFUND_MS - 1000);
    const fresh = new Date(now.getTime() - DIRECT_AUTO_REFUND_MS + 1000);
    expect(isDirectAutoRefundDue({ status: "paid", tradeKind: "direct", handedOverAt: null, createdAt: old }, now)).toBe(true);
    expect(isDirectAutoRefundDue({ status: "paid", tradeKind: "direct", handedOverAt: null, createdAt: fresh }, now)).toBe(false);
  });
  it("전달표시가 있으면 자동환불 대상 아님(자동확정 경로)", () => {
    const old = new Date(now.getTime() - DIRECT_AUTO_REFUND_MS - 1000);
    expect(isDirectAutoRefundDue({ status: "handed_over", tradeKind: "direct", handedOverAt: old, createdAt: old }, now)).toBe(false);
  });
  it("택배는 자동환불 대상 아님", () => {
    const old = new Date(now.getTime() - DIRECT_AUTO_REFUND_MS - 1000);
    expect(isDirectAutoRefundDue({ status: "paid", tradeKind: "parcel", handedOverAt: null, createdAt: old }, now)).toBe(false);
  });
});
