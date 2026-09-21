import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  seriesKind: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  series: { count: vi.fn() },
}));
vi.mock("@/lib/catalog-db", () => ({ catalogDb: m }));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import {
  createSeriesKind,
  deleteSeriesKind,
  updateSeriesKind,
} from "@/modules/series/kinds-actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "admin" } as never);
});

describe("createSeriesKind", () => {
  it("관리자가 아니면 requireAdmin 오류를 그대로 던진다", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    await expect(createSeriesKind({ key: "kuji", label: "쿠지", displayOrder: 7 })).rejects.toThrow(
      "관리자 권한",
    );
    expect(m.seriesKind.create).not.toHaveBeenCalled();
  });

  it("키 형식이 틀리면 invalid_input", async () => {
    const res = await createSeriesKind({ key: "한글키", label: "x", displayOrder: 1 });
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("happy path — 생성 후 id 반환", async () => {
    m.seriesKind.create.mockResolvedValue({ id: BigInt(9) });
    const res = await createSeriesKind({ key: "CD benefits", label: "CD 특전", displayOrder: 6 });
    expect(res).toEqual({ ok: true, data: { id: 9 } });
    expect(m.seriesKind.create).toHaveBeenCalledWith({
      data: { key: "CD benefits", label: "CD 특전", displayOrder: 6 },
    });
  });
});

describe("updateSeriesKind", () => {
  it("라벨·순서만 갱신한다(key 는 바꾸지 않음)", async () => {
    m.seriesKind.update.mockResolvedValue({});
    const res = await updateSeriesKind({ id: 3, label: "정규 트레카", displayOrder: 1 });
    expect(res.ok).toBe(true);
    const call = m.seriesKind.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: BigInt(3) });
    expect(call.data).toMatchObject({ label: "정규 트레카", displayOrder: 1 });
    expect(call.data).not.toHaveProperty("key");
  });
});

describe("deleteSeriesKind", () => {
  it("쓰는 시리즈가 있으면 kind_in_use 로 거절", async () => {
    m.seriesKind.findUnique.mockResolvedValue({ id: BigInt(3), key: "event" });
    m.series.count.mockResolvedValue(12);
    const res = await deleteSeriesKind(3);
    expect(res).toMatchObject({ ok: false, code: "kind_in_use" });
    expect(m.seriesKind.delete).not.toHaveBeenCalled();
  });

  it("미사용 종류는 삭제한다", async () => {
    m.seriesKind.findUnique.mockResolvedValue({ id: BigInt(4), key: "season" });
    m.series.count.mockResolvedValue(0);
    m.seriesKind.delete.mockResolvedValue({});
    const res = await deleteSeriesKind(4);
    expect(res.ok).toBe(true);
    expect(m.seriesKind.delete).toHaveBeenCalledWith({ where: { id: BigInt(4) } });
  });

  it("없는 id 는 not_found", async () => {
    m.seriesKind.findUnique.mockResolvedValue(null);
    const res = await deleteSeriesKind(99);
    expect(res).toMatchObject({ ok: false, code: "not_found" });
  });
});
