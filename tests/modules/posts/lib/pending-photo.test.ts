import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHOTO_MAX_TOTAL_BYTES } from "@/modules/posts/lib/schema";

const { ugc } = vi.hoisted(() => ({
  ugc: {
    presignUgcPut: vi.fn(),
    headUgcObject: vi.fn(),
    getUgcObjectRange: vi.fn(),
    copyUgcObject: vi.fn(),
    deleteUgcObject: vi.fn(),
  },
}));
vi.mock("@/lib/r2/ugc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/r2/ugc")>();
  return {
    ...actual, // R2ConditionFailedError·상수는 실제 사용
    presignUgcPut: ugc.presignUgcPut,
    headUgcObject: ugc.headUgcObject,
    getUgcObjectRange: ugc.getUgcObjectRange,
    copyUgcObject: ugc.copyUgcObject,
    deleteUgcObject: ugc.deleteUgcObject,
  };
});

// 유효한 1000x800 JPEG 헤더 바이트(image-header 테스트 픽스처와 동일 구성)
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0x20, 0x03, 0xe8, 0x03, 0x11, 0x22,
]); // height=0x0320(800), width=0x03e8(1000)

const pendingCount = vi.fn();
const pendingCreate = vi.fn();
const queryRaw = vi.fn();
const tx = { $queryRaw: queryRaw };
const db = {
  pendingPostPhoto: { count: pendingCount, create: pendingCreate },
  $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
} as never;

function consumedRow(id: number, key = `posts/tmp/${id}.jpg`) {
  return { id: BigInt(id), r2_key: key, content_type: "image/jpeg", size_bytes: 14 };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingCount.mockResolvedValue(0);
  let nextId = 1;
  pendingCreate.mockImplementation(async () => ({ id: BigInt(nextId++) }));
  ugc.presignUgcPut.mockResolvedValue("https://signed-put");
  ugc.headUgcObject.mockResolvedValue({
    etag: '"e"',
    contentType: "image/jpeg",
    contentLength: 14,
  });
  ugc.getUgcObjectRange.mockResolvedValue(JPEG_BYTES);
  ugc.copyUgcObject.mockResolvedValue(undefined);
  ugc.deleteUgcObject.mockResolvedValue(true);
});

describe("createPendingPhotos", () => {
  it("pendingPhoto 기록 + posts/tmp 키 + presign URL 반환", async () => {
    const { createPendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const out = await createPendingPhotos("acc-1", [{ contentType: "image/jpeg", sizeBytes: 14 }], db);
    expect(out).toHaveLength(1);
    expect(out[0].r2Key).toMatch(/^posts\/tmp\/.+\.jpg$/);
    expect(out[0].uploadUrl).toBe("https://signed-put");
    const data = pendingCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ accountId: "acc-1", contentType: "image/jpeg", sizeBytes: 14 });
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("배치 rate limit — 현재 25 + 10장 요청 → 거부(P1-3)", async () => {
    pendingCount.mockResolvedValue(25);
    const { createPendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const files = Array.from({ length: 10 }, () => ({ contentType: "image/jpeg", sizeBytes: 1 }));
    await expect(createPendingPhotos("acc-1", files, db)).rejects.toThrow(/너무 잦습니다/);
    expect(pendingCreate).not.toHaveBeenCalled();
  });
});

describe("consumePendingPhotos — 원자 소비", () => {
  it("전건 반환 시 입력 순서로 매핑", async () => {
    queryRaw.mockResolvedValue([consumedRow(2), consumedRow(1)]); // DB 반환 순서 뒤섞임
    const { consumePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const out = await consumePendingPhotos("acc-1", [1, 2], db);
    expect(out.map((c) => Number(c.id))).toEqual([1, 2]);
  });

  it("하나라도 조건 불통과(만료·타계정·기소비)면 전체 거부 → tx 롤백(P1-7)", async () => {
    queryRaw.mockResolvedValue([consumedRow(1)]); // 2건 요청, 1건만 갱신
    const { consumePendingPhotos, PHOTO_UPLOAD_RETRY_MESSAGE } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    await expect(consumePendingPhotos("acc-1", [1, 2], db)).rejects.toThrow(
      PHOTO_UPLOAD_RETRY_MESSAGE,
    );
  });
});

describe("finalizePendingPhotos — 검증·복사·보상", () => {
  it("성공 시 최종 키 배열(tmp prefix 제거·순서 유지)", async () => {
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const keys = await finalizePendingPhotos([
      { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      { id: 2n, r2Key: "posts/tmp/b.jpg", contentType: "image/jpeg", sizeBytes: 14 },
    ]);
    expect(keys).toEqual(["posts/a.jpg", "posts/b.jpg"]);
    expect(ugc.copyUgcObject).toHaveBeenCalledTimes(2);
  });

  it("HEAD 실측이 선언값과 다르면 거부 + 임시 객체 삭제", async () => {
    ugc.headUgcObject.mockResolvedValue({
      etag: '"e"',
      contentType: "image/jpeg",
      contentLength: 999,
    });
    const { finalizePendingPhotos, PHOTO_UPLOAD_RETRY_MESSAGE } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    await expect(
      finalizePendingPhotos([
        { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      ]),
    ).rejects.toThrow(PHOTO_UPLOAD_RETRY_MESSAGE);
    // 실패 경로 삭제는 cleanup 예산 signal과 함께 호출된다(P1-3).
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith(
      "posts/tmp/a.jpg",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(ugc.copyUgcObject).not.toHaveBeenCalled();
  });

  it("매직바이트 불일치(선언 jpeg·실제 png) 거부", async () => {
    ugc.getUgcObjectRange.mockResolvedValue(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(
      finalizePendingPhotos([
        { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      ]),
    ).rejects.toThrow(/다시 진행/);
  });

  it("픽셀 상한 초과(9000px) 거부 — fail-closed", async () => {
    // width=0x2328(9000)
    ugc.getUgcObjectRange.mockResolvedValue(
      new Uint8Array([
        0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x23, 0x28, 0x03, 0x11, 0x22,
      ]),
    );
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(
      finalizePendingPhotos([
        { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      ]),
    ).rejects.toThrow(/다시 진행/);
  });

  it("복사 412(ETag 불일치)면 도메인 에러로 변환", async () => {
    const { R2ConditionFailedError } = await import("@/lib/r2/ugc");
    ugc.copyUgcObject.mockRejectedValue(new R2ConditionFailedError("mismatch"));
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(
      finalizePendingPhotos([
        { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      ]),
    ).rejects.toThrow(/다시 진행/);
  });

  it("부분 실패 시 이미 복사된 최종 객체 전체를 보상 삭제(P1-7)", async () => {
    ugc.copyUgcObject
      .mockResolvedValueOnce(undefined) // a 복사 성공
      .mockRejectedValueOnce(new Error("boom")); // b 복사 실패
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(
      finalizePendingPhotos([
        { id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 },
        { id: 2n, r2Key: "posts/tmp/b.jpg", contentType: "image/jpeg", sizeBytes: 14 },
      ]),
    ).rejects.toThrow();
    // 누적 최종 키 보상 — 보상 삭제도 cleanup 예산 signal과 함께 호출된다.
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith(
      "posts/a.jpg",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("전체 예산 소진 시 진행 중 요청 중단·신규 미시작·완료분 보상(P1-3)", async () => {
    // a만 즉시 성공하고 나머지는 "예산 signal이 abort될 때 실패하는 진행 중 요청"을 재현한다.
    ugc.headUgcObject.mockImplementation(
      async (key: string, options?: { signal?: AbortSignal }) => {
        if (key === "posts/tmp/a.jpg") {
          return { etag: '"e"', contentType: "image/jpeg", contentLength: 14 };
        }
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      },
    );
    const pendingPhotos = ["a", "b", "c", "d", "e"].map((name, index) => ({
      id: BigInt(index + 1),
      r2Key: `posts/tmp/${name}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 14,
    }));

    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const { PHOTO_RETRY_CODE } = await import("@/modules/posts/lib/schema"); // 코드는 schema 소관
    const budget = new AbortController();
    const pending = finalizePendingPhotos(pendingPhotos, { budget: budget.signal }).catch(
      (error) => error,
    );
    await new Promise((resolve) => setTimeout(resolve, 0)); // a 완료 → d 디스패치까지 진행
    budget.abort(new Error("파이프라인 예산 초과"));
    const error = await pending;

    expect(error).toMatchObject({ code: PHOTO_RETRY_CODE }); // 사용자에겐 재업로드 안내
    // 동시성 3 — a 완료 후 d가 투입되고, e는 예산 소진으로 시작조차 하지 않는다.
    const started = ugc.headUgcObject.mock.calls.map((call) => call[0]);
    expect(started).toContain("posts/tmp/d.jpg");
    expect(started).not.toContain("posts/tmp/e.jpg");
    // 이미 복사된 최종 객체는 보상 삭제된다.
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith("posts/a.jpg", expect.anything());
  });

  it("예산 소진 후 정리 DELETE가 지연돼도 cleanup 예산으로 끊긴다(P1-3)", async () => {
    // 실패 경로 정리가 "끝나지 않는 DELETE"인 상황 — cleanup signal이 없으면 요청 10초 × 3회가
    // 사진마다 더해져 전체 응답이 예산을 크게 넘긴다.
    // HEAD는 try 밖이라 여기서 실패시키면 catch에 진입하지 못한다 → copy에서 실패시킨다.
    ugc.copyUgcObject.mockRejectedValue(new Error("복사 실패"));
    ugc.deleteUgcObject.mockImplementation(
      (_key: string, options?: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          // 실제 deleteUgcObject는 이미 abort된 signal이면 즉시 false를 돌려준다
          // (fetchWithRetry의 throwIfAborted → catch → false). 그 동작을 그대로 모사한다.
          if (options?.signal?.aborted) {
            resolve(false);
            return;
          }
          options?.signal?.addEventListener("abort", () => resolve(false), { once: true });
        }),
    );

    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const cleanup = new AbortController();
    const pending = finalizePendingPhotos(
      [{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }],
      { cleanupBudget: cleanup.signal },
    ).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleanup.abort(new Error("정리 예산 초과"));

    // 정리가 매달려 있어도 전체가 끝난다(끊기지 않으면 이 await가 반환되지 않는다).
    expect(await pending).toBeInstanceOf(Error);
    expect(ugc.deleteUgcObject).toHaveBeenCalledWith("posts/tmp/a.jpg", expect.anything());
  });

  it("임시 객체 삭제가 지연돼도 최종 객체 삭제가 막히지 않는다(리뷰 P2-1)", async () => {
    // 두 삭제는 같은 cleanup 예산을 공유한다. 임시 객체를 먼저 지우면 그 지연이 예산을 소진해
    // 최종 객체 삭제가 이미 abort된 signal로 호출되고 요청조차 나가지 못한다.
    // 임시 객체는 posts/tmp/ lifecycle이 걷어가지만 posts/에는 lifecycle이 없다.
    ugc.copyUgcObject.mockRejectedValue(new Error("복사 실패"));
    const attempts: { key: string; abortedOnCall: boolean }[] = [];
    ugc.deleteUgcObject.mockImplementation((key: string, options?: { signal?: AbortSignal }) => {
      attempts.push({ key, abortedOnCall: options?.signal?.aborted === true });
      if (key !== "posts/tmp/a.jpg") return Promise.resolve(true);
      // 임시 객체 삭제만 예산이 끊길 때까지 매달린다.
      return new Promise<boolean>((resolve) => {
        if (options?.signal?.aborted) {
          resolve(false);
          return;
        }
        options?.signal?.addEventListener("abort", () => resolve(false), { once: true });
      });
    });

    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const cleanup = new AbortController();
    const pending = finalizePendingPhotos(
      [{ id: 1n, r2Key: "posts/tmp/a.jpg", contentType: "image/jpeg", sizeBytes: 14 }],
      { cleanupBudget: cleanup.signal },
    ).catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleanup.abort(new Error("정리 예산 초과"));
    expect(await pending).toBeInstanceOf(Error);

    // 최종 객체가 먼저, 아직 살아 있는 signal로 삭제된다.
    // 순서가 반대면 abortedOnCall이 true가 되어 실제 DELETE 요청이 나가지 않는다.
    expect(attempts.map((attempt) => attempt.key)).toEqual(["posts/a.jpg", "posts/tmp/a.jpg"]);
    expect(attempts[0].abortedOnCall).toBe(false);
  });

  it("보상 삭제 실패 키는 [photo-orphan] 구조화 로그", async () => {
    ugc.deleteUgcObject.mockResolvedValue(false);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { compensateFinalObjects } = await import("@/modules/posts/lib/pending-photo");
    await compensateFinalObjects(["posts/x.jpg"]);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[photo-orphan]"),
      expect.anything(),
    );
    errSpy.mockRestore();
  });
});

describe("글당 합계 상한은 소비 시점에 강제된다(리뷰 P1-2)", () => {
  const FIVE_MB = 5 * 1024 * 1024;
  const pendingRow = (id: number, size: number) => ({
    id: BigInt(id),
    r2_key: `posts/tmp/${id}.jpg`,
    content_type: "image/jpeg",
    size_bytes: size,
  });

  it("presign 배치를 나눠 받아도 합산 30MB 초과면 거부된다", async () => {
    // 각 배치는 스키마 검사를 통과했지만(30MB 이하), 합치면 초과하는 상황.
    queryRaw.mockResolvedValue([
      ...Array.from({ length: 6 }, (_, i) => pendingRow(i + 1, FIVE_MB)), // 30MB
      pendingRow(7, FIVE_MB), // +5MB → 35MB
    ]);
    const { consumePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(consumePendingPhotos("acc-1", [1, 2, 3, 4, 5, 6, 7], db)).rejects.toThrow(
      "사진 합계는 30MB 이하여야 합니다",
    );
  });

  it("정확히 30MB는 허용한다(경계)", async () => {
    queryRaw.mockResolvedValue(Array.from({ length: 6 }, (_, i) => pendingRow(i + 1, FIVE_MB)));
    const { consumePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const out = await consumePendingPhotos("acc-1", [1, 2, 3, 4, 5, 6], db);
    expect(out).toHaveLength(6);
  });

  it("초과 예외는 tx 안에서 던져 조건부 UPDATE가 롤백되게 한다", async () => {
    queryRaw.mockResolvedValue([pendingRow(1, PHOTO_MAX_TOTAL_BYTES + 1)]);
    const { consumePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(consumePendingPhotos("acc-1", [1], db)).rejects.toThrow(/30MB/);
    // tx 콜백 안에서 던져야 소비가 되돌아간다 — 콜백 밖에서 검사하면 이미 커밋된 뒤다.
    const transactionMock = (db as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction;
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});

describe("복사 응답 유실 시 최종 객체 보상(리뷰 P1-3)", () => {
  const pendingPhoto = {
    id: 1n,
    r2Key: "posts/tmp/a.jpg",
    contentType: "image/jpeg",
    sizeBytes: 14,
  };

  it("복사가 예외로 끝나도 시도한 최종 키를 삭제 대상에 포함한다", async () => {
    // R2가 객체를 만든 뒤 응답만 유실된 상황 — 예외만 보고 판단하면 최종 객체가 남는다.
    ugc.copyUgcObject.mockRejectedValue(new Error("socket hang up"));
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(finalizePendingPhotos([pendingPhoto])).rejects.toThrow();

    const deletedKeys = ugc.deleteUgcObject.mock.calls.map((call) => call[0]);
    expect(deletedKeys).toContain("posts/tmp/a.jpg"); // 임시 객체
    expect(deletedKeys).toContain("posts/a.jpg"); // 시도한 최종 객체
  });

  it("최종 키 삭제까지 실패하면 [photo-orphan] 구조화 로그를 남긴다", async () => {
    ugc.copyUgcObject.mockRejectedValue(new Error("socket hang up"));
    ugc.deleteUgcObject.mockResolvedValue(false);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(finalizePendingPhotos([pendingPhoto])).rejects.toThrow();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[photo-orphan]"),
      "posts/a.jpg",
    );
    errSpy.mockRestore();
  });

  it("복사 전 단계(검증) 실패에는 최종 키 삭제를 시도하지 않는다", async () => {
    // HEAD 실측 불일치 — 복사를 시도조차 하지 않았으므로 최종 객체는 존재할 수 없다.
    ugc.headUgcObject.mockResolvedValue({
      etag: '"e"',
      contentType: "image/jpeg",
      contentLength: 999,
    });
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    await expect(finalizePendingPhotos([pendingPhoto])).rejects.toThrow();
    const deletedKeys = ugc.deleteUgcObject.mock.calls.map((call) => call[0]);
    expect(deletedKeys).toEqual(["posts/tmp/a.jpg"]);
  });

  it("정상 복사 경로에는 삭제가 개입하지 않는다", async () => {
    const { finalizePendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const keys = await finalizePendingPhotos([pendingPhoto]);
    expect(keys).toEqual(["posts/a.jpg"]);
    expect(ugc.deleteUgcObject).not.toHaveBeenCalled();
  });
});
