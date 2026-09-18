import { beforeEach, describe, expect, it, vi } from "vitest";

const photoFindUnique = vi.fn();
const photoFindFirst = vi.fn();
const fetchR2Object = vi.fn();
const processProductImage = vi.fn();

vi.mock("@/lib/env", () => ({
  env: { R2_SECRET_ACCESS_KEY: "test-only-media-signing-secret" },
}));
vi.mock("@/lib/db", () => ({
  db: {
    productPhoto: {
      findUnique: photoFindUnique,
      findFirst: photoFindFirst,
    },
  },
}));
vi.mock("@/lib/r2/get", () => ({ fetchR2Object }));
vi.mock("@/modules/products/lib/watermark", () => ({ processProductImage }));

// URL 생성(순수) = customer-media, 이미지 응답(sharp/db) = customer-media-response.
const RESPONSE_MODULE = "@/modules/products/lib/customer-media-response";
const URL_MODULE = "@/modules/products/lib/customer-media";

beforeEach(() => {
  photoFindUnique.mockReset();
  photoFindFirst.mockReset();
  fetchR2Object.mockReset();
  processProductImage.mockReset();
});

describe("customer product media", () => {
  it("변형별 URL은 R2 키 없이 서명 경로(변형 포함)로 만든다", async () => {
    const {
      productDetailPhotoUrl,
      productGridPhotoUrl,
      productGridThumbnailUrl,
      collectionThumbnailUrl,
      collectionPhotoUrl,
    } = await import("@/modules/products/lib/customer-media");

    expect(productDetailPhotoUrl(12)).toMatch(
      /^\/media\/product-photos\/12\/d\/[A-Za-z0-9_-]{24}$/,
    );
    expect(productGridPhotoUrl(12)).toMatch(
      /^\/media\/product-photos\/12\/g\/[A-Za-z0-9_-]{24}$/,
    );
    expect(productGridThumbnailUrl(34)).toMatch(
      /^\/media\/product-thumbnails\/34\/g\/[A-Za-z0-9_-]{24}$/,
    );
    expect(collectionThumbnailUrl(34)).toMatch(
      /^\/media\/product-thumbnails\/34\/cg\/[A-Za-z0-9_-]{24}$/,
    );
    expect(collectionPhotoUrl(12)).toMatch(
      /^\/media\/product-photos\/12\/cd\/[A-Za-z0-9_-]{24}$/,
    );
  });

  it("변조된 서명·미지원 변형은 DB와 R2를 조회하지 않고 404", async () => {
    const { customerProductImageResponse } = await import(RESPONSE_MODULE);

    expect((await customerProductImageResponse("photo", 1, "d", "forged")).status).toBe(404);
    // 변형 코드를 위조해도(서명 불일치) 404 — 워터마크 우회 방지
    expect((await customerProductImageResponse("photo", 1, "cd", "forged")).status).toBe(404);
    // 알 수 없는 변형 코드도 404
    expect((await customerProductImageResponse("photo", 1, "xx", "forged")).status).toBe(404);
    expect(photoFindUnique).not.toHaveBeenCalled();
    expect(fetchR2Object).not.toHaveBeenCalled();
  });

  it("유효한 상세 요청은 R2 원본을 해당 변형 옵션으로 처리해 반환한다", async () => {
    const source = new Uint8Array([1, 2, 3]);
    const output = Buffer.from([4, 5, 6]);
    photoFindUnique.mockResolvedValue({ r2Key: "products/original/private.jpg" });
    fetchR2Object.mockResolvedValue({
      body: new Response(source).body,
      contentType: "image/jpeg",
      contentLength: source.byteLength,
    });
    processProductImage.mockResolvedValue(output);
    const { customerProductImageResponse } = await import(RESPONSE_MODULE);
    const { productDetailPhotoUrl, MEDIA_VARIANTS } = await import(URL_MODULE);

    // 경로: /media/product-photos/7/d/<sig>
    const parts = productDetailPhotoUrl(7).split("/");
    const signature = parts.at(-1)!;
    const variant = parts.at(-2)!;

    const response = await customerProductImageResponse(
      "photo",
      7,
      variant,
      signature,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(fetchR2Object).toHaveBeenCalledWith("products/original/private.jpg");
    // 상세(d) 변형 옵션으로 처리 — 워터마크 true, 큰 폭
    expect(processProductImage).toHaveBeenCalledWith(
      Buffer.from(source),
      MEDIA_VARIANTS.d,
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(output);
  });
});
