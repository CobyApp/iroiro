import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentAccount, mockRequireAdmin, mockIssue, mockEvidenceUrl } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockIssue: vi.fn(),
  mockEvidenceUrl: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount: mockGetCurrentAccount }));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/modules/posts/lib/pending-photo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/posts/lib/pending-photo")>()),
  createPendingPhotos: mockIssue,
}));
vi.mock("@/modules/posts/lib/queries", () => ({ getReportEvidencePhotoUrl: mockEvidenceUrl }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount
    .mockReset()
    .mockResolvedValue({ id: "acc-1", displayName: "u", publicCode: "UC1" });
  mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1", isAdmin: true });
  mockIssue
    .mockReset()
    .mockResolvedValue([{ pendingPhotoId: 1, r2Key: "posts/tmp/a.jpg", uploadUrl: "https://put" }]);
  mockEvidenceUrl.mockReset().mockResolvedValue("https://signed-get");
});

describe("presignPostPhotos", () => {
  it("미로그인은 /login 리다이렉트", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { presignPostPhotos } = await import("@/modules/posts/actions/photo");
    await expect(
      presignPostPhotos({ files: [{ contentType: "image/jpeg", sizeBytes: 1 }] }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("미허용 MIME·초과 크기는 invalid_input(ok:false)", async () => {
    const { presignPostPhotos } = await import("@/modules/posts/actions/photo");
    const result = await presignPostPhotos({ files: [{ contentType: "image/heic", sizeBytes: 1 }] });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(mockIssue).not.toHaveBeenCalled();
  });

  it("정상 입력이면 대기 사진 목록 반환", async () => {
    const { presignPostPhotos } = await import("@/modules/posts/actions/photo");
    const result = await presignPostPhotos({
      files: [{ contentType: "image/jpeg", sizeBytes: 100 }],
    });
    expect(result).toEqual({
      ok: true,
      data: [{ pendingPhotoId: 1, r2Key: "posts/tmp/a.jpg", uploadUrl: "https://put" }],
    });
    expect(mockIssue).toHaveBeenCalledWith("acc-1", [{ contentType: "image/jpeg", sizeBytes: 100 }]);
  });
});

describe("signReportEvidencePhoto — P1-4", () => {
  it("비관리자는 입력 파싱 전에 거부된다(requireAdmin 선실행)", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("관리자 권한이 필요합니다"));
    const { signReportEvidencePhoto } = await import("@/modules/posts/actions/photo");
    await expect(signReportEvidencePhoto({ reportId: "잘못된 타입" })).rejects.toThrow(/관리자/);
    expect(mockEvidenceUrl).not.toHaveBeenCalled();
  });

  it("정상 입력이면 snapshot 키 서명 URL 반환", async () => {
    const { signReportEvidencePhoto } = await import("@/modules/posts/actions/photo");
    const result = await signReportEvidencePhoto({ reportId: 1, photoIndex: 0 });
    expect(result).toEqual({ ok: true, data: { url: "https://signed-get" } });
    expect(mockEvidenceUrl).toHaveBeenCalledWith(1, 0);
  });

  it("잘못된 photoIndex 형은 invalid_input", async () => {
    const { signReportEvidencePhoto } = await import("@/modules/posts/actions/photo");
    const result = await signReportEvidencePhoto({ reportId: 1, photoIndex: -1 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
  });
});
