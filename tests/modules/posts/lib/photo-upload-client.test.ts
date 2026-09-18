import { beforeEach, describe, expect, it, vi } from "vitest";
import { preparePhotos } from "@/modules/posts/lib/photo-upload-client";

const jpegBlob = (size = 1000) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });
const file = (name: string, type: string) => new File([new Uint8Array(10)], name, { type });

// jsdom 없이도 동작해야 하는 순수 로직 — previewUrl 생성은 DI가 아닌 URL.createObjectURL이므로 스텁.
beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
  });
});

// over로 넘기는 값도 vi.fn()이라 mock 프로퍼티가 유지된다 — 스프레드가 타입을 일반 함수로
// 넓히므로 기본 객체의 타입으로 되돌린다(호출부는 반드시 vi.fn()을 넘긴다).
function makeDeps(over: Partial<Parameters<typeof preparePhotos>[2]> = {}) {
  const base = {
    reencode: vi.fn(async () => jpegBlob()),
    presign: vi.fn(async (files: { contentType: string; sizeBytes: number }[]) => ({
      ok: true as const,
      data: files.map((_, i) => ({
        pendingPhotoId: i + 1,
        r2Key: `posts/tmp/${i}.jpg`,
        uploadUrl: `https://put/${i}`,
      })),
    })),
    put: vi.fn(async (_url: string, _blob: Blob) => ({ status: 200 })),
  };
  return { ...base, ...over } as typeof base;
}

describe("preparePhotos — 순서 계약(P1-1)", () => {
  it("재인코딩→최종 Blob 확정→검증→presign→동일 Blob PUT 순서", async () => {
    const deps = makeDeps();
    const result = await preparePhotos(
      [file("a.jpg", "image/jpeg")],
      { existingCount: 0, existingTotalBytes: 0 },
      deps,
    );
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([{ pendingPhotoId: 1, previewUrl: "blob:preview", sizeBytes: 1000 }]);
    // presign 입력이 "재인코딩된 Blob"의 type·size여야 한다(원본 File 아님).
    expect(deps.presign).toHaveBeenCalledWith([{ contentType: "image/jpeg", sizeBytes: 1000 }]);
    // PUT은 presign과 같은 Blob 인스턴스.
    const putBlob = deps.put.mock.calls[0][1];
    expect(putBlob).toBe(await deps.reencode.mock.results[0].value);
    // 호출 순서: reencode가 presign보다 먼저.
    expect(deps.reencode.mock.invocationCallOrder[0]).toBeLessThan(
      deps.presign.mock.invocationCallOrder[0],
    );
  });

  it("HEIC는 선택 단계에서 거부 + [heic-reject] 로그(P2-4)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps();
    const result = await preparePhotos(
      [file("a.heic", "image/heic")],
      { existingCount: 0, existingTotalBytes: 0 },
      deps,
    );
    expect(result.items).toEqual([]);
    expect(result.errors[0]).toContain("지원하지 않는 이미지 형식");
    expect(warn).toHaveBeenCalledWith("[heic-reject]", "image/heic");
    expect(deps.reencode).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("재인코딩 실패(디코딩 불가)도 파일 단위 오류로 수집", async () => {
    const deps = makeDeps({
      reencode: vi.fn(async () => {
        throw new Error("decode fail");
      }),
    });
    const result = await preparePhotos(
      [file("broken.png", "image/png")],
      { existingCount: 0, existingTotalBytes: 0 },
      deps,
    );
    expect(result.items).toEqual([]);
    expect(result.errors[0]).toContain("처리할 수 없습니다");
  });

  it("최종 Blob 기준 5MB 초과·기존 합산 10장/30MB 초과 거부", async () => {
    const big = makeDeps({ reencode: vi.fn(async () => jpegBlob(5 * 1024 * 1024 + 1)) });
    const r1 = await preparePhotos(
      [file("a.jpg", "image/jpeg")],
      { existingCount: 0, existingTotalBytes: 0 },
      big,
    );
    expect(r1.errors[0]).toContain("5MB");

    const deps = makeDeps();
    const r2 = await preparePhotos(
      [file("a.jpg", "image/jpeg")],
      { existingCount: 10, existingTotalBytes: 0 },
      deps,
    );
    expect(r2.errors[0]).toContain("최대 10장");

    const r3 = await preparePhotos(
      [file("a.jpg", "image/jpeg")],
      { existingCount: 0, existingTotalBytes: 30 * 1024 * 1024 },
      deps,
    );
    expect(r3.errors[0]).toContain("30MB");
  });

  it("presign 실패(ok:false)는 그대로 오류로 전달", async () => {
    const deps = makeDeps({
      presign: vi.fn(async () => ({ ok: false as const, message: "요청이 너무 잦습니다" })),
    });
    const result = await preparePhotos(
      [file("a.jpg", "image/jpeg")],
      { existingCount: 0, existingTotalBytes: 0 },
      deps,
    );
    expect(result.errors).toEqual(["요청이 너무 잦습니다"]);
  });
});
