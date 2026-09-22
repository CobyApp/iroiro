import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  series: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  product: { count: vi.fn() },
  usedListing: { count: vi.fn() },
}));
// series 는 카탈로그 DB, 상품·중고 참조 검사는 커머스 DB — 테스트는 한 객체로 둘 다 받는다.
vi.mock("@/lib/db", () => ({ db: m }));
vi.mock("@/lib/catalog-db", async () => {
  const { Prisma } = await import("@/lib/generated/catalog-client");
  return { CatalogPrisma: Prisma, catalogDb: m };
});
vi.mock("@/modules/admin/lib/requireAdmin", () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { createSeries, updateSeries } from "@/modules/series/actions";

function seriesRow(data: Record<string, unknown> = {}) {
  return {
    id: BigInt(11),
    sku: "EV-xmas",
    label: "クリスマス",
    labelI18n: null,
    kind: "event",
    teamId: BigInt(3),
    productUrl: null,
    ...data,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "admin" } as never);
  m.series.findUnique.mockResolvedValue(null);
  m.series.create.mockImplementation(async ({ data }) => seriesRow(data));
  m.series.update.mockResolvedValue({});
});

const base = {
  label: "クリスマス",
  labelKo: "크리스마스",
  kind: "event",
  teamId: 3,
};

describe("createSeries", () => {
  it("관리자가 아니면 requireAdmin 오류를 그대로 던진다", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    await expect(createSeries({ ...base, sku: "EV-xmas" })).rejects.toThrow("관리자 권한");
    expect(m.series.create).not.toHaveBeenCalled();
  });

  it("라벨이 비면 invalid_input", async () => {
    const res = await createSeries({ ...base, label: "  ", sku: "x" });
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
    expect(m.series.create).not.toHaveBeenCalled();
  });

  it("상품 URL 이 http(s) 가 아니면 invalid_input", async () => {
    const res = await createSeries({ ...base, sku: "x", productUrl: "ftp://shop.example" });
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
    const res2 = await createSeries({ ...base, sku: "x", productUrl: "not a url" });
    expect(res2).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("happy path — SKU·URL·한국어 병기를 저장하고 등록 폼이 바로 고를 수 있는 행을 돌려준다", async () => {
    const res = await createSeries({
      ...base,
      sku: " EV-xmas ",
      productUrl: "https://shop.example/xmas",
    });
    expect(m.series.create).toHaveBeenCalledWith({
      data: {
        sku: "EV-xmas",
        label: "クリスマス",
        labelI18n: { ko: "크리스마스" },
        kind: "event",
        teamId: BigInt(3),
        productUrl: "https://shop.example/xmas",
      },
    });
    expect(res).toEqual({
      ok: true,
      data: {
        id: 11,
        sku: "EV-xmas",
        label: "クリスマス",
        labelKo: "크리스마스",
        kind: "event",
        teamId: 3,
        productUrl: "https://shop.example/xmas",
      },
    });
  });

  it("SKU 를 비우면 usr- 접두어로 자동 발급한다", async () => {
    const res = await createSeries({ ...base, sku: "" });
    expect(res.ok).toBe(true);
    const data = m.series.create.mock.calls[0][0].data;
    expect(data.sku).toMatch(/^usr-[0-9a-f]{8}$/);
    // 중복 검사도 자동 발급된 SKU 로 한다
    expect(m.series.findUnique).toHaveBeenCalledWith({ where: { sku: data.sku } });
  });

  it("SKU 가 이미 있으면 duplicate_sku", async () => {
    m.series.findUnique.mockResolvedValue(seriesRow());
    const res = await createSeries({ ...base, sku: "EV-xmas" });
    expect(res).toMatchObject({ ok: false, code: "duplicate_sku" });
    expect(m.series.create).not.toHaveBeenCalled();
  });
});

describe("updateSeries", () => {
  it("수정은 SKU 가 필수", async () => {
    const res = await updateSeries(11, { ...base, sku: "" });
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
    expect(m.series.update).not.toHaveBeenCalled();
  });

  it("상품 URL 을 비우면 null 로 저장한다", async () => {
    const res = await updateSeries(11, { ...base, sku: "EV-xmas", productUrl: null });
    expect(res.ok).toBe(true);
    const data = m.series.update.mock.calls[0][0].data;
    expect(data.productUrl).toBeNull();
    expect(data.sku).toBe("EV-xmas");
  });

  it("다른 시리즈가 같은 SKU 를 쓰면 duplicate_sku", async () => {
    m.series.findUnique.mockResolvedValue({ id: BigInt(99) });
    const res = await updateSeries(11, { ...base, sku: "EV-xmas" });
    expect(res).toMatchObject({ ok: false, code: "duplicate_sku" });
  });
});
