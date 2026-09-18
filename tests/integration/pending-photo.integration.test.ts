// 실 DB(Supabase local) + 실 스토리지(MinIO) 통합 검증 — 단위 테스트가 tx를 mock하므로
// "조건부 UPDATE가 정말 원자적인가 / 부분 실패가 정말 롤백되는가"는 여기서만 확인된다.
//
// 실행: npm run services:up 후
//   RUN_INTEGRATION=1 npx vitest run tests/integration/pending-photo.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_INTEGRATION === "1";

// FK를 쓰지 않는 스키마라 임의 UUID로 대기 사진을 만들 수 있다(저장소 규칙).
const ACCOUNT = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ACCOUNT = "bbbbbbbb-0000-4000-8000-000000000002";
const createdKeys: string[] = [];

// 1000x800 JPEG 헤더 — 뒤를 0으로 채워 선언 크기와 실제 바이트를 일치시킨다.
const JPEG = new Uint8Array(1024);
JPEG.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0x20, 0x03, 0xe8, 0x03, 0x11, 0x22]);

async function put(url: string, body: Uint8Array, contentType: string) {
  const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "If-None-Match": "*" },
    body: buffer,
  });
}

beforeAll(async () => {
  if (!enabled) return;
  const { db } = await import("@/lib/db");
  await db.pendingPostPhoto.deleteMany({ where: { accountId: { in: [ACCOUNT, OTHER_ACCOUNT] } } });
});

afterAll(async () => {
  if (!enabled) return;
  const { db } = await import("@/lib/db");
  const { deleteUgcObject } = await import("@/lib/r2/ugc");
  for (const key of createdKeys) await deleteUgcObject(key);
  await db.pendingPostPhoto.deleteMany({ where: { accountId: { in: [ACCOUNT, OTHER_ACCOUNT] } } });
  await db.$disconnect();
});

describe.skipIf(!enabled)("pending-photo — 실 DB·실 스토리지", () => {
  it("createPendingPhotos가 대기 사진 행과 presign URL을 만든다", async () => {
    const { createPendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const { db } = await import("@/lib/db");

    const issued = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);

    const row = await db.pendingPostPhoto.findUnique({ where: { id: BigInt(issued[0].pendingPhotoId) } });
    expect(row).not.toBeNull();
    expect(row!.consumedAt).toBeNull();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(new URL(issued[0].uploadUrl).searchParams.has("X-Amz-Signature")).toBe(true);
  });

  it("소비는 1회만 성공한다 — 재소비는 거부", async () => {
    const { createPendingPhotos, consumePendingPhotos } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    const issued = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);

    const consumed = await consumePendingPhotos(ACCOUNT, [issued[0].pendingPhotoId]);
    expect(consumed[0].r2Key).toBe(issued[0].r2Key);
    await expect(consumePendingPhotos(ACCOUNT, [issued[0].pendingPhotoId])).rejects.toThrow(/다시 진행/);
  });

  it("타 계정 대기 사진은 소비되지 않는다", async () => {
    const { createPendingPhotos, consumePendingPhotos } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    const issued = await createPendingPhotos(OTHER_ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);
    await expect(consumePendingPhotos(ACCOUNT, [issued[0].pendingPhotoId])).rejects.toThrow(/다시 진행/);
  });

  it("만료된 대기 사진은 소비되지 않는다", async () => {
    const { createPendingPhotos, consumePendingPhotos } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    const { db } = await import("@/lib/db");
    const issued = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);
    await db.pendingPostPhoto.update({
      where: { id: BigInt(issued[0].pendingPhotoId) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(consumePendingPhotos(ACCOUNT, [issued[0].pendingPhotoId])).rejects.toThrow(/다시 진행/);
  });

  it("부분 불통과면 전체 롤백 — 유효한 대기 사진도 미소비 상태로 남는다(P1-7)", async () => {
    const { createPendingPhotos, consumePendingPhotos } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    const { db } = await import("@/lib/db");

    const [good] = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    const [foreign] = await createPendingPhotos(OTHER_ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(good.r2Key, foreign.r2Key);

    await expect(consumePendingPhotos(ACCOUNT, [good.pendingPhotoId, foreign.pendingPhotoId])).rejects.toThrow(
      /다시 진행/,
    );

    // 롤백 확인 — mock tx로는 증명할 수 없는 지점.
    const row = await db.pendingPostPhoto.findUnique({ where: { id: BigInt(good.pendingPhotoId) } });
    expect(row!.consumedAt).toBeNull();
    // 롤백됐으므로 이후 정상 소비가 가능해야 한다.
    const retried = await consumePendingPhotos(ACCOUNT, [good.pendingPhotoId]);
    expect(retried).toHaveLength(1);
  });

  it("배치를 나눠 받아도 글당 합계 30MB 초과는 거부되고 전건 롤백된다(리뷰 P1-2)", async () => {
    const { createPendingPhotos, consumePendingPhotos } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    const { db } = await import("@/lib/db");
    const FIVE_MB = 5 * 1024 * 1024;

    // 각 배치는 presign 스키마의 30MB 검사를 통과한다(30MB / 5MB).
    const batchA = await createPendingPhotos(
      ACCOUNT,
      Array.from({ length: 6 }, () => ({ contentType: "image/jpeg", sizeBytes: FIVE_MB })),
    );
    const batchB = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: FIVE_MB },
    ]);
    createdKeys.push(...batchA.map((c) => c.r2Key), ...batchB.map((c) => c.r2Key));

    const allIds = [...batchA, ...batchB].map((c) => c.pendingPhotoId); // 합계 35MB
    await expect(consumePendingPhotos(ACCOUNT, allIds)).rejects.toThrow(/30MB/);

    // 롤백 확인 — mock tx로는 증명할 수 없는 지점. 하나라도 소비됐으면 대기 사진이 유실된다.
    const rows = await db.pendingPostPhoto.findMany({
      where: { id: { in: allIds.map((id) => BigInt(id)) } },
      select: { consumedAt: true },
    });
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.consumedAt === null)).toBe(true);

    // 정확히 30MB(6장)는 허용된다 — 경계.
    const consumed = await consumePendingPhotos(
      ACCOUNT,
      batchA.map((c) => c.pendingPhotoId),
    );
    expect(consumed).toHaveLength(6);
  });

  it("업로드 → 소비 → 확정 전체 흐름이 최종 객체를 만든다", async () => {
    const { createPendingPhotos, consumePendingPhotos, finalizePendingPhotos, cleanupTmpObjects } =
      await import("@/modules/posts/lib/pending-photo");
    const { headUgcObject } = await import("@/lib/r2/ugc");

    const issued = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);

    const uploaded = await put(issued[0].uploadUrl, JPEG, "image/jpeg");
    expect(uploaded.ok).toBe(true);

    const consumed = await consumePendingPhotos(ACCOUNT, [issued[0].pendingPhotoId]);
    const finalKeys = await finalizePendingPhotos(consumed);
    createdKeys.push(...finalKeys);

    expect(finalKeys[0]).toBe(issued[0].r2Key.replace("posts/tmp/", "posts/"));
    const finalHead = await headUgcObject(finalKeys[0]);
    expect(finalHead!.contentLength).toBe(JPEG.length);
    expect(finalHead!.contentType).toBe("image/jpeg");

    // 커밋 후 임시 객체 정리 — 이후 tmp 키는 사라진다.
    await cleanupTmpObjects([issued[0].r2Key]);
    expect(await headUgcObject(issued[0].r2Key)).toBeNull();
  });

  it("업로드하지 않은 대기 사진은 확정 단계에서 거부된다", async () => {
    const { createPendingPhotos, consumePendingPhotos, finalizePendingPhotos } = await import(
      "@/modules/posts/lib/pending-photo"
    );
    const issued = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);
    const consumed = await consumePendingPhotos(ACCOUNT, [issued[0].pendingPhotoId]);
    // 객체가 없으므로 HEAD가 null → 재업로드 안내
    await expect(finalizePendingPhotos(consumed)).rejects.toThrow(/다시 진행/);
  });

  it("선언 크기와 다른 바이트는 애초에 업로드되지 않는다(크기 강제)", async () => {
    const { createPendingPhotos } = await import("@/modules/posts/lib/pending-photo");
    const { headUgcObject } = await import("@/lib/r2/ugc");

    const issued = await createPendingPhotos(ACCOUNT, [
      { contentType: "image/jpeg", sizeBytes: JPEG.length },
    ]);
    createdKeys.push(issued[0].r2Key);

    const oversized = await put(issued[0].uploadUrl, new Uint8Array(JPEG.length * 2), "image/jpeg");
    expect(oversized.ok).toBe(false);
    expect(await headUgcObject(issued[0].r2Key)).toBeNull();
  });
});
