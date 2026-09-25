import { describe, expect, it } from "vitest";
import { usedListingCreateSchema, usedBuySchema, meetLocationSchema } from "@/modules/used/lib/schema";

const baseListing = {
  itemType: "photocard" as const,
  title: "테스트 굿즈",
  condition: "good" as const,
  saleMode: "fixed" as const,
  price: 10000,
  photos: [{ r2Key: "x.jpg", displayOrder: 0, isPrimary: true }],
};

describe("만날 장소 스키마", () => {
  it("정상 좌표·라벨을 통과시킨다", () => {
    expect(() =>
      meetLocationSchema.parse({ label: "서면역 1번 출구", address: "부산 부산진구", lat: 35.1578, lng: 129.0594 }),
    ).not.toThrow();
  });
  it("대한민국 범위 밖 좌표는 거부한다", () => {
    expect(() => meetLocationSchema.parse({ label: "x", lat: 10, lng: 10 })).toThrow();
  });
  it("라벨이 비면 거부한다", () => {
    expect(() => meetLocationSchema.parse({ label: "", lat: 35, lng: 129 })).toThrow();
  });
});

describe("등록 — 거래 방식", () => {
  it("기본값(택배만)으로 통과", () => {
    const r = usedListingCreateSchema.parse(baseListing);
    expect(r.parcelEnabled).toBe(true);
    expect(r.directEnabled).toBe(false);
  });
  it("택배·직거래 모두 끄면 거부", () => {
    expect(() =>
      usedListingCreateSchema.parse({ ...baseListing, parcelEnabled: false, directEnabled: false }),
    ).toThrow();
  });
  it("직거래만 켜고 만날 장소 지정 가능(최대 3)", () => {
    const loc = { label: "서면역", address: "", lat: 35.1, lng: 129.0 };
    expect(() =>
      usedListingCreateSchema.parse({
        ...baseListing,
        parcelEnabled: false,
        directEnabled: true,
        meetLocations: [loc, loc, loc],
      }),
    ).not.toThrow();
    expect(() =>
      usedListingCreateSchema.parse({
        ...baseListing,
        parcelEnabled: false,
        directEnabled: true,
        meetLocations: [loc, loc, loc, loc],
      }),
    ).toThrow();
  });
  it("직거래 꺼진 채 만날 장소를 넣으면 거부", () => {
    expect(() =>
      usedListingCreateSchema.parse({
        ...baseListing,
        directEnabled: false,
        meetLocations: [{ label: "x", address: "", lat: 35, lng: 129 }],
      }),
    ).toThrow();
  });
});

describe("구매 — 거래 방식별 배송지", () => {
  it("택배는 배송지 필수", () => {
    expect(() => usedBuySchema.parse({ listingId: 1, tradeKind: "parcel" })).toThrow();
    expect(() =>
      usedBuySchema.parse({
        listingId: 1,
        tradeKind: "parcel",
        recipientName: "홍길동",
        recipientPhone: "010-1234-5678",
        recipientAddress: "부산시 부산진구 어딘가 123",
      }),
    ).not.toThrow();
  });
  it("직거래는 배송지 없이 통과", () => {
    expect(() => usedBuySchema.parse({ listingId: 1, tradeKind: "direct" })).not.toThrow();
  });
});
