import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { NOTICE_PIN_LIMIT } from "@/modules/notices/lib/schema";

const queryRaw = vi.fn();
const count = vi.fn();
const create = vi.fn();
const findFirstOrThrow = vi.fn();
const updateMany = vi.fn();
const photoCreateMany = vi.fn();
const photoDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: queryRaw,
        notice: { count, create, findFirstOrThrow, updateMany },
        noticePhoto: { createMany: photoCreateMany, deleteMany: photoDeleteMany },
      }),
    notice: { updateMany },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// requireAdmin이 자체 세션(DAL) 기반 실검증이므로 admin 세션을 스텁한다.
const { mockGetCurrentAccount } = vi.hoisted(() => ({
  mockGetCurrentAccount: vi.fn(),
}));
vi.mock("@/modules/auth/dal", () => ({
  getCurrentAccount: mockGetCurrentAccount,
}));

const { mockGetSignedUploadUrl, mockBuildNoticeR2Key } = vi.hoisted(() => ({
  mockGetSignedUploadUrl: vi.fn(async () => "https://r2.test/upload?sig"),
  mockBuildNoticeR2Key: vi.fn(() => "notices/original/mock.jpg"),
}));
vi.mock("@/lib/r2/presign", () => ({
  getSignedUploadUrl: mockGetSignedUploadUrl,
  buildNoticeR2Key: mockBuildNoticeR2Key,
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));

const ADMIN_ID = "0198aaaa-bbbb-7ccc-8ddd-eeeeffff0001";

const baseRow = {
  id: 1n,
  publicCode: "AbCdEfGh1234",
  category: "general",
  title: "공지",
  body: "본문",
  isPinned: false,
  deletedAt: null,
  createdAt: new Date("2026-07-19T00:00:00Z"),
  createdBy: ADMIN_ID,
  updatedAt: new Date("2026-07-19T00:00:00Z"),
  updatedBy: ADMIN_ID,
};

// Prisma 7 + adapter-pg 실측 P2002 구조 — meta.target은 없고 위반 컬럼은
// meta.driverAdapterError.cause.constraint.fields에 담긴다 (lib/prisma-errors 참고).
function p2002(fields: string[]) {
  return new Prisma.PrismaClientKnownRequestError("unique violation", {
    code: "P2002",
    clientVersion: "test",
    meta: {
      modelName: "Notice",
      driverAdapterError: {
        cause: {
          originalCode: "23505",
          originalMessage: "duplicate key value violates unique constraint",
          kind: "UniqueConstraintViolation",
          constraint: { fields },
        },
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  mockGetCurrentAccount
    .mockReset()
    .mockResolvedValue({ id: ADMIN_ID, isAdmin: true });
  queryRaw.mockReset().mockResolvedValue([]);
  count.mockReset().mockResolvedValue(0);
  create.mockReset().mockResolvedValue(baseRow);
  findFirstOrThrow.mockReset().mockResolvedValue(baseRow);
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  photoCreateMany.mockReset();
  photoDeleteMany.mockReset();
});

describe("createNotice", () => {
  const input = { category: "general" as const, title: "공지", body: "본문" };

  it("입력 검증 실패 — 공백만인 제목은 거부한다", async () => {
    const { createNotice } = await import("@/modules/notices/actions");
    const result = await createNotice({
      category: "general",
      title: "   ",
      body: "본문",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(create).not.toHaveBeenCalled();
  });

  it("public_code와 세션 admin id 작성자를 채워 생성한다", async () => {
    const { createNotice } = await import("@/modules/notices/actions");
    const result = await createNotice(input);

    const data = create.mock.calls[0][0].data;
    expect(data.publicCode).toHaveLength(12);
    expect(data.createdBy).toBe(ADMIN_ID);
    expect(data.updatedBy).toBe(ADMIN_ID);
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ id: 1 }) });
  });

  it("도메인 오류 — 고정 상한 초과는 throw가 아니라 ok:false 결과로 반환(프로덕션 메시지 보존)", async () => {
    count.mockResolvedValue(NOTICE_PIN_LIMIT);
    const { createNotice } = await import("@/modules/notices/actions");
    const result = await createNotice({ ...input, isPinned: true });
    expect(result).toEqual({
      ok: false,
      message: `상단 고정은 최대 ${NOTICE_PIN_LIMIT}개까지 가능합니다`,
      code: undefined,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1); // pg_advisory_xact_lock
    expect(create).not.toHaveBeenCalled();
  });

  it("비고정 생성은 lock·카운트를 건너뛴다", async () => {
    const { createNotice } = await import("@/modules/notices/actions");
    await createNotice(input);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("public_code 충돌(P2002)이면 재생성 재시도한다", async () => {
    create
      .mockRejectedValueOnce(p2002(["public_code"]))
      .mockResolvedValueOnce(baseRow);
    const { createNotice } = await import("@/modules/notices/actions");
    await createNotice(input);
    expect(create).toHaveBeenCalledTimes(2);

    const first = create.mock.calls[0][0].data.publicCode;
    const second = create.mock.calls[1][0].data.publicCode;
    expect(first).not.toBe(second);
  });

  it("충돌이 재시도 상한(3회)까지 이어지면 에러를 전파한다", async () => {
    create.mockRejectedValue(p2002(["public_code"]));
    const { createNotice } = await import("@/modules/notices/actions");
    await expect(createNotice(input)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("public_code 외 컬럼의 unique 위반은 재시도 없이 전파한다", async () => {
    create.mockRejectedValue(p2002(["title"]));
    const { createNotice } = await import("@/modules/notices/actions");
    await expect(createNotice(input)).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("createNotice — photos를 배열 index 순서로 createMany 한다", async () => {
    create.mockResolvedValue({ ...baseRow, id: 7n });
    const { createNotice } = await import("@/modules/notices/actions");
    const result = await createNotice({
      category: "general",
      title: "공지",
      body: "본문",
      isPinned: false,
      photos: ["notices/original/a.jpg", "notices/original/b.webp"],
    });

    expect(photoCreateMany).toHaveBeenCalledWith({
      data: [
        { noticeId: 7n, r2Key: "notices/original/a.jpg", displayOrder: 0 },
        { noticeId: 7n, r2Key: "notices/original/b.webp", displayOrder: 1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.photos.map((p) => p.r2Key)).toEqual([
        "notices/original/a.jpg",
        "notices/original/b.webp",
      ]);
    }
  });

  it("createNotice — photos가 없으면 createMany를 호출하지 않는다", async () => {
    create.mockResolvedValue(baseRow);
    const { createNotice } = await import("@/modules/notices/actions");
    await createNotice({ category: "general", title: "공지", body: "본문", isPinned: false });
    expect(photoCreateMany).not.toHaveBeenCalled();
  });

  it("createNotice — notices/original/ 밖의 키는 zod가 거부한다", async () => {
    const { createNotice } = await import("@/modules/notices/actions");
    const result = await createNotice({
      category: "general",
      title: "공지",
      body: "본문",
      isPinned: false,
      photos: ["products/original/steal.jpg"],
    });
    expect(result.ok).toBe(false);
  });
});

describe("updateNotice", () => {
  // 사진과 무관한 케이스들 — update는 전체 교체라 photos 생략이 불가능하므로 의도를 명시한다
  const input = {
    id: 1,
    category: "general" as const,
    title: "수정",
    body: "본문",
    isPinned: true,
    photos: [],
  };

  it("입력 검증 실패 — id 0은 거부한다", async () => {
    const { updateNotice } = await import("@/modules/notices/actions");
    const result = await updateNotice({ ...input, id: 0 });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("도메인 오류 — 존재하지 않거나 삭제된 공지는 throw가 아니라 ok:false 결과로 반환 (조건부 UPDATE 0행)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { updateNotice } = await import("@/modules/notices/actions");
    const result = await updateNotice(input);
    expect(result).toEqual({
      ok: false,
      message: "공지를 찾을 수 없습니다",
      code: undefined,
    });
    expect(findFirstOrThrow).not.toHaveBeenCalled();
  });

  it("쓰기 조건에 deletedAt null 필터를 포함한다 (동시 삭제 TOCTOU 차단)", async () => {
    const { updateNotice } = await import("@/modules/notices/actions");
    await updateNotice(input);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 1n,
      deletedAt: null,
    });
  });

  it("고정 전환 시 자기 자신을 제외하고 상한을 센다", async () => {
    const { updateNotice } = await import("@/modules/notices/actions");
    await updateNotice(input);
    expect(count).toHaveBeenCalledWith({
      where: { isPinned: true, deletedAt: null, id: { not: 1n } },
    });
  });

  it("updateNotice — 전체 교체: deleteMany 후 createMany", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue(baseRow);
    const { updateNotice } = await import("@/modules/notices/actions");
    const result = await updateNotice({
      id: 1,
      category: "general",
      title: "공지",
      body: "본문",
      isPinned: false,
      photos: ["notices/original/keep.jpg"],
    });

    expect(photoDeleteMany).toHaveBeenCalledWith({ where: { noticeId: 1n } });
    expect(photoCreateMany).toHaveBeenCalledWith({
      data: [{ noticeId: 1n, r2Key: "notices/original/keep.jpg", displayOrder: 0 }],
    });
    expect(photoDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      photoCreateMany.mock.invocationCallOrder[0],
    );
    expect(result.ok).toBe(true);
  });

  it("updateNotice — photos 빈 배열이면 deleteMany만 (전부 제거)", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue(baseRow);
    const { updateNotice } = await import("@/modules/notices/actions");
    await updateNotice({
      id: 1,
      category: "general",
      title: "공지",
      body: "본문",
      isPinned: false,
      photos: [],
    });
    expect(photoDeleteMany).toHaveBeenCalledWith({ where: { noticeId: 1n } });
    expect(photoCreateMany).not.toHaveBeenCalled();
  });
});

describe("deleteNotice", () => {
  it("도메인 오류 — 0 또는 음수 id는 throw가 아니라 ok:false 결과로 반환", async () => {
    const { deleteNotice } = await import("@/modules/notices/actions");
    const zero = await deleteNotice(0);
    const negative = await deleteNotice(-1);
    expect(zero).toEqual({
      ok: false,
      message: "유효하지 않은 공지 ID 입니다",
      code: undefined,
    });
    expect(negative).toEqual({
      ok: false,
      message: "유효하지 않은 공지 ID 입니다",
      code: undefined,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("soft delete — deletedAt 스탬프만 남긴다", async () => {
    const { deleteNotice } = await import("@/modules/notices/actions");
    await deleteNotice(1);
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 1n, deletedAt: null });
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it("도메인 오류 — 이미 삭제됐거나 없으면 throw가 아니라 ok:false 결과로 반환 (갱신 0행)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { deleteNotice } = await import("@/modules/notices/actions");
    const result = await deleteNotice(1);
    expect(result).toEqual({
      ok: false,
      message: "공지를 찾을 수 없습니다",
      code: undefined,
    });
  });
});

describe("presignNoticePhotos", () => {
  const file = { filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 1000 };

  it("비관리자는 재던져진다 (ok:false 아님)", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    await expect(presignNoticePhotos([file])).rejects.toThrow();
  });

  it("빈 배열은 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([]);
    expect(result).toEqual({ ok: false, message: "파일이 없습니다" });
  });

  it("11장은 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos(Array.from({ length: 11 }, () => file));
    expect(result.ok).toBe(false);
  });

  it("HEIC 등 미지원 MIME은 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([{ ...file, mimeType: "image/heic" }]);
    expect(result).toEqual({
      ok: false,
      message: "지원하지 않는 이미지 형식입니다 (JPG·PNG·WebP만 가능)",
    });
  });

  it("5MB 초과는 거부한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([{ ...file, sizeBytes: 5 * 1024 * 1024 + 1 }]);
    expect(result.ok).toBe(false);
  });

  it("정상 요청은 파일별 {r2Key, uploadUrl}을 반환한다", async () => {
    const { presignNoticePhotos } = await import("@/modules/notices/actions");
    const result = await presignNoticePhotos([file, { ...file, filename: "b.png", mimeType: "image/png" }]);
    expect(result).toEqual({
      ok: true,
      data: [
        { r2Key: "notices/original/mock.jpg", uploadUrl: "https://r2.test/upload?sig" },
        { r2Key: "notices/original/mock.jpg", uploadUrl: "https://r2.test/upload?sig" },
      ],
    });
    expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("notices/original/mock.jpg", "image/jpeg");
    expect(mockGetSignedUploadUrl).toHaveBeenCalledWith("notices/original/mock.jpg", "image/png");
  });
});

describe("requireBoardManager 가드", () => {
  it("비로그인 사용자는 권한 에러 — mutation 전에 거부된다", async () => {
    mockGetCurrentAccount.mockResolvedValue(null);
    const { createNotice } = await import("@/modules/notices/actions");
    await expect(
      createNotice({ category: "general", title: "공지", body: "본문" }),
    ).rejects.toThrow(/권한/);
    expect(create).not.toHaveBeenCalled();
  });

  it("일반 회원(isAdmin=false)은 권한 에러 — mutation 전에 거부된다", async () => {
    mockGetCurrentAccount.mockResolvedValue({ id: "user-1", isAdmin: false });
    const { deleteNotice } = await import("@/modules/notices/actions");
    await expect(deleteNotice(1)).rejects.toThrow(/권한/);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
