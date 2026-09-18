// 실 스토리지(로컬 MinIO) 통합 검증 — 단위 테스트가 fetch를 mock하므로 "우리 모듈이 실제로
// 통하는가"는 여기서만 확인된다. Task 0 게이트는 별도 스파이크 스크립트로 R2 동작을 입증했고,
// 이 파일은 같은 계약이 lib/r2/ugc.ts를 통해서도 성립하는지 본다.
//
// 실행: docker compose up -d 후
//   RUN_INTEGRATION=1 npx vitest run tests/integration/ugc.integration.test.ts
// 기본 `npm test`에서는 건너뛴다(외부 의존 — validate를 밀폐 상태로 유지).
import { afterAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_INTEGRATION === "1";
const runId = `it-${Date.now()}`;
const tmpKey = `posts/tmp/${runId}.jpg`;
const finalKey = `posts/${runId}.jpg`;
const createdKeys = [tmpKey, finalKey, `${finalKey}.bad`];

// 정상 JPEG 헤더로 시작하는 바이트 — 헤더 파서와 같은 형식 가정을 쓴다.
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(1020).fill(0)]);

async function rawPut(url: string, body: Uint8Array, contentType: string) {
  // Uint8Array<ArrayBufferLike>는 BodyInit에 직접 대입되지 않는다(TS 제네릭 typed array).
  // 뷰가 가리키는 구간만 잘라 ArrayBuffer로 넘긴다.
  const buffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType, "If-None-Match": "*" },
    body: buffer,
  });
}

afterAll(async () => {
  if (!enabled) return;
  const { deleteUgcObject } = await import("@/lib/r2/ugc");
  for (const key of createdKeys) await deleteUgcObject(key);
});

describe.skipIf(!enabled)("lib/r2/ugc — 로컬 MinIO 통합", () => {
  it("presign한 URL에 선언과 다른 크기를 보내면 거부되고 객체가 생기지 않는다", async () => {
    const { presignUgcPut, headUgcObject } = await import("@/lib/r2/ugc");
    const url = await presignUgcPut(tmpKey, "image/jpeg", JPEG_BYTES.length);

    const oversized = await rawPut(url, new Uint8Array(JPEG_BYTES.length * 2), "image/jpeg");
    expect(oversized.ok).toBe(false);
    expect(await headUgcObject(tmpKey)).toBeNull(); // 미생성 — 크기 강제의 실제 판정
  });

  it("정확한 크기·MIME은 업로드되고 HEAD가 실측값을 돌려준다", async () => {
    const { presignUgcPut, headUgcObject } = await import("@/lib/r2/ugc");
    const url = await presignUgcPut(tmpKey, "image/jpeg", JPEG_BYTES.length);

    const ok = await rawPut(url, JPEG_BYTES, "image/jpeg");
    expect(ok.ok).toBe(true);

    const head = await headUgcObject(tmpKey);
    expect(head).not.toBeNull();
    expect(head!.contentLength).toBe(JPEG_BYTES.length);
    expect(head!.contentType).toBe("image/jpeg");
    expect(head!.etag.length).toBeGreaterThan(0);
  });

  it("range GET은 If-Match로 고정되고, ETag가 어긋나면 R2ConditionFailedError", async () => {
    const { headUgcObject, getUgcObjectRange, R2ConditionFailedError } = await import(
      "@/lib/r2/ugc"
    );
    const head = await headUgcObject(tmpKey);

    const bytes = await getUgcObjectRange(tmpKey, head!.etag, 0, 15);
    expect(bytes.length).toBe(16);
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]); // 매직바이트

    await expect(
      getUgcObjectRange(tmpKey, '"0000000000000000000000000000ffff"', 0, 15),
    ).rejects.toBeInstanceOf(R2ConditionFailedError);
  });

  it("조건부 copy로 최종 키를 만들고, 어긋난 ETag는 거부된다", async () => {
    const { headUgcObject, copyUgcObject, R2ConditionFailedError } = await import("@/lib/r2/ugc");
    const head = await headUgcObject(tmpKey);

    await copyUgcObject(tmpKey, finalKey, head!.etag, "image/jpeg");
    const finalHead = await headUgcObject(finalKey);
    expect(finalHead!.contentLength).toBe(JPEG_BYTES.length);
    expect(finalHead!.contentType).toBe("image/jpeg");

    await expect(
      copyUgcObject(tmpKey, `${finalKey}.bad`, '"0000000000000000000000000000ffff"', "image/jpeg"),
    ).rejects.toBeInstanceOf(R2ConditionFailedError);
    expect(await headUgcObject(`${finalKey}.bad`)).toBeNull();
  });

  it("서명 GET은 열리고 서명 없는 접근은 거부된다(비공개 버킷)", async () => {
    const { getSignedUgcGetUrl } = await import("@/lib/r2/ugc");
    const signed = await getSignedUgcGetUrl(finalKey);

    const withSignature = await fetch(signed);
    expect(withSignature.status).toBe(200);
    expect(withSignature.headers.get("cache-control")).toContain("no-store");

    const url = new URL(signed);
    for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
    const unsigned = await fetch(url);
    expect(unsigned.ok).toBe(false); // 400·401·403 — 저장소마다 코드가 다르다
  });

  it("삭제는 멱등이다 — 이미 없는 키도 성공", async () => {
    const { deleteUgcObject, headUgcObject } = await import("@/lib/r2/ugc");
    expect(await deleteUgcObject(tmpKey)).toBe(true);
    expect(await headUgcObject(tmpKey)).toBeNull();
    expect(await deleteUgcObject(tmpKey)).toBe(true); // 재삭제도 성공
  });
});
