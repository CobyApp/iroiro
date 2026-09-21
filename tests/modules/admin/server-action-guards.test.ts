import { beforeEach, describe, expect, it, vi } from "vitest";

// 외곽 게이트(공용 자격증명 Basic Auth·폼 로그인)를 제거하면서, admin mutation의 방어선은
// 각 Server Action의 requireAdmin 호출 하나로 좁혀졌다. Server Action은 액션 ID만 알면
// 공개 라우트로도 POST되므로 layout 가드가 이들을 대신 막아주지 않는다.
// 이 테스트는 "가드가 빠진 액션이 다시 생기는 것"을 막는다.
const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({
  requireAdmin: mockRequireAdmin,
}));

const reject = vi.fn(async () => {
  throw new Error("DB에 도달하면 안 된다");
});
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get: () =>
        new Proxy({}, { get: () => reject }),
    },
  ),
}));
vi.mock("@/lib/r2/presign", () => ({
  getSignedUploadUrl: reject,
  buildR2Key: () => "k",
}));
vi.mock("@/modules/products/lib/fx", () => ({ fetchJpyKrwRate: reject }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const DENIED = /관리자 권한/;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
});

describe("배너 액션은 비관리자를 거부한다", () => {
  it("presignBannerImage", async () => {
    const { presignBannerImage } = await import("@/modules/banners/actions");
    await expect(
      presignBannerImage({ contentType: "image/png" }),
    ).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });

  it("createBanner", async () => {
    const { createBanner } = await import("@/modules/banners/actions");
    await expect(
      createBanner({
        title: "t",
        imageKey: "banners/x.png",
        linkUrl: "",
        startsAt: "",
        endsAt: "",
        sortOrder: 0,
      }),
    ).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });

  it("updateBanner", async () => {
    const { updateBanner } = await import("@/modules/banners/actions");
    await expect(
      updateBanner({
        id: 1,
        title: "t",
        imageKey: "banners/x.png",
        linkUrl: "",
        startsAt: "",
        endsAt: "",
        sortOrder: 0,
      }),
    ).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });

  it("deleteBanner", async () => {
    const { deleteBanner } = await import("@/modules/banners/actions");
    await expect(deleteBanner(1)).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });
});

describe("상품 액션은 비관리자를 거부한다", () => {
  it("presignProductPhotos — 서명 URL 발급 이전에 차단", async () => {
    const { presignProductPhotos } = await import("@/modules/products/actions");
    await expect(
      presignProductPhotos([
        { filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10 },
      ]),
    ).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });

  it("deleteProduct", async () => {
    const { deleteProduct } = await import("@/modules/products/actions");
    await expect(deleteProduct(1)).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });
});

describe("외부 자원을 쓰는 액션은 호출 전에 거부한다", () => {
  it("getExchangeRateForDate — 외부 환율 API 호출 이전에 차단", async () => {
    const { getExchangeRateForDate } = await import(
      "@/modules/products/actions"
    );
    await expect(getExchangeRateForDate("2026-01-01")).rejects.toThrow(DENIED);
    expect(reject).not.toHaveBeenCalled();
  });
});
