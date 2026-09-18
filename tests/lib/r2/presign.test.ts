import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2/client", () => ({
  r2: {
    sign: vi.fn(),
  },
  r2Bucket: "test-bucket",
  r2Endpoint: "http://localhost:9000",
  r2PublicBase: "http://cdn.example.com/test-bucket",
}));

// UUIDv7: 3번째 그룹이 버전 7, hex 소문자
const UUID_V7 = "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}";

describe("buildR2Key", () => {
  it("products/original/{uuidv7}.{ext} 형식 (샤드 없음)", async () => {
    const { buildR2Key } = await import("@/lib/r2/presign");
    const key = buildR2Key("thumbnail.jpg");
    expect(key).toMatch(new RegExp(`^products/original/${UUID_V7}\\.jpg$`));
  });

  it("productId 없이 filename 한 개만 받는다 (pending- 개념 제거)", async () => {
    const { buildR2Key } = await import("@/lib/r2/presign");
    const key = buildR2Key("a.jpg");
    expect(key.startsWith("products/original/")).toBe(true);
    expect(key).not.toContain("pending-");
  });

  it("확장자는 소문자로 정규화", async () => {
    const { buildR2Key } = await import("@/lib/r2/presign");
    expect(buildR2Key("PHOTO.JPEG").endsWith(".jpeg")).toBe(true);
  });

  it("여러 점이 있으면 마지막을 ext로 사용", async () => {
    const { buildR2Key } = await import("@/lib/r2/presign");
    expect(buildR2Key("archive.tar.gz").endsWith(".gz")).toBe(true);
  });

  it("확장자가 없으면 .bin 폴백", async () => {
    const { buildR2Key } = await import("@/lib/r2/presign");
    expect(buildR2Key("noextension").endsWith(".bin")).toBe(true);
  });

  it("매 호출마다 고유한 키", async () => {
    const { buildR2Key } = await import("@/lib/r2/presign");
    expect(buildR2Key("a.jpg")).not.toBe(buildR2Key("a.jpg"));
  });
});

// 공지 첨부 키. 실제 소비처(modules/notices/actions)의 테스트는 이 함수를 mock하므로
// 형식 계약은 여기서만 검증된다 — notices schema의 photos 정규식과 짝을 이룬다.
describe("buildNoticeR2Key", () => {
  it("notices/original/{uuidv7}.{ext} 형식 (상품과 대칭, 샤드 없음)", async () => {
    const { buildNoticeR2Key } = await import("@/lib/r2/presign");
    const key = buildNoticeR2Key("photo.jpg");
    expect(key).toMatch(new RegExp(`^notices/original/${UUID_V7}\\.jpg$`));
  });

  it("notices schema의 photos 키 정규식을 만족한다", async () => {
    const { buildNoticeR2Key } = await import("@/lib/r2/presign");
    expect(buildNoticeR2Key("photo.webp")).toMatch(/^notices\/original\/[^/]+$/);
  });

  it("확장자는 소문자로 정규화하고, 없으면 .bin 폴백", async () => {
    const { buildNoticeR2Key } = await import("@/lib/r2/presign");
    expect(buildNoticeR2Key("PHOTO.PNG").endsWith(".png")).toBe(true);
    expect(buildNoticeR2Key("noextension").endsWith(".bin")).toBe(true);
  });

  it("매 호출마다 고유한 키", async () => {
    const { buildNoticeR2Key } = await import("@/lib/r2/presign");
    expect(buildNoticeR2Key("a.jpg")).not.toBe(buildNoticeR2Key("a.jpg"));
  });
});

describe("getPublicUrl", () => {
  it("r2PublicBase + key 합성", async () => {
    const { getPublicUrl } = await import("@/lib/r2/presign");
    expect(getPublicUrl("products/original/9c/img.jpg")).toBe(
      "http://cdn.example.com/test-bucket/products/original/9c/img.jpg",
    );
  });
});

describe("getSignedUploadUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("r2.sign에 PUT + content-type을 전달하고 signed URL 반환", async () => {
    const { r2 } = await import("@/lib/r2/client");
    const signedUrl = "http://localhost:9000/test-bucket/key?X-Amz-Signature=abc";
    vi.mocked(r2.sign).mockResolvedValueOnce(
      new Request(signedUrl) as unknown as Awaited<ReturnType<typeof r2.sign>>,
    );

    const { getSignedUploadUrl } = await import("@/lib/r2/presign");
    const result = await getSignedUploadUrl(
      "products/original/9c/img.jpg",
      "image/jpeg",
      900,
    );

    expect(result).toBe(signedUrl);
    expect(r2.sign).toHaveBeenCalledOnce();
    const call = vi.mocked(r2.sign).mock.calls[0];
    const request = call[0] as Request;
    expect(request.method).toBe("PUT");
    expect(request.headers.get("content-type")).toBe("image/jpeg");
    expect(request.url).toContain("X-Amz-Expires=900");
  });

  it("expiresInSeconds 기본값 3600", async () => {
    const { r2 } = await import("@/lib/r2/client");
    vi.mocked(r2.sign).mockResolvedValueOnce(
      new Request("http://x/y?signed=1") as unknown as Awaited<
        ReturnType<typeof r2.sign>
      >,
    );

    const { getSignedUploadUrl } = await import("@/lib/r2/presign");
    await getSignedUploadUrl("k", "image/png");

    const request = vi.mocked(r2.sign).mock.calls[0][0] as Request;
    expect(request.url).toContain("X-Amz-Expires=3600");
  });
});
