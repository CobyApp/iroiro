import { beforeEach, describe, expect, it, vi } from "vitest";

const photoFindUnique = vi.fn();
const photoFindFirst = vi.fn();
const fetchR2Object = vi.fn();
const fetchProductPhotoOriginal = vi.fn();
const processProductImage = vi.fn();
const getCurrentAccount = vi.fn();
const ownsProduct = vi.fn();

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
vi.mock("@/modules/products/lib/photo-source", () => ({ fetchProductPhotoOriginal }));
vi.mock("@/modules/products/lib/watermark", () => ({ processProductImage }));
vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount }));
vi.mock("@/modules/collection/lib/queries", () => ({ ownsProduct }));

// URL 생성(순수) = customer-media, 이미지 응답(sharp/db) = customer-media-response.
const RESPONSE_MODULE = "@/modules/products/lib/customer-media-response";
const URL_MODULE = "@/modules/products/lib/customer-media";

const SOURCE = new Uint8Array([1, 2, 3]);
const OUTPUT = Buffer.from([4, 5, 6]);

function r2Object() {
  return { body: new Response(SOURCE).body, contentType: "image/jpeg", contentLength: 3 };
}

// 경로: /media/product-photos/<id>/<variant>/<sig> → [variant, signature]
async function signedParts(url: string): Promise<[string, string]> {
  const parts = url.split("/");
  return [parts.at(-2)!, parts.at(-1)!];
}

beforeEach(() => {
  vi.clearAllMocks();
  photoFindUnique.mockReset();
  photoFindFirst.mockReset();
  fetchR2Object.mockReset();
  fetchProductPhotoOriginal.mockReset();
  processProductImage.mockReset();
  getCurrentAccount.mockReset().mockResolvedValue(null);
  ownsProduct.mockReset().mockResolvedValue(false);
});

describe("customer product media", () => {
  it("변형별 URL은 R2 키 없이 서명 경로(변형 포함)로 만든다", async () => {
    const {
      productDetailPhotoUrl,
      productGridPhotoUrl,
      productGridThumbnailUrl,
      collectionThumbnailUrl,
      collectionPhotoUrl,
      isOwnerVariant,
    } = await import(URL_MODULE);

    expect(productDetailPhotoUrl(12)).toMatch(/^\/media\/product-photos\/12\/d\/[A-Za-z0-9_-]{24}$/);
    expect(productGridPhotoUrl(12)).toMatch(/^\/media\/product-photos\/12\/g\/[A-Za-z0-9_-]{24}$/);
    expect(productGridThumbnailUrl(34)).toMatch(/^\/media\/product-thumbnails\/34\/g\/[A-Za-z0-9_-]{24}$/);
    expect(collectionThumbnailUrl(34)).toMatch(/^\/media\/product-thumbnails\/34\/cg\/[A-Za-z0-9_-]{24}$/);
    expect(collectionPhotoUrl(12)).toMatch(/^\/media\/product-photos\/12\/cd\/[A-Za-z0-9_-]{24}$/);
    // 소유자 변형은 cg/cd 만
    expect(isOwnerVariant("cg")).toBe(true);
    expect(isOwnerVariant("cd")).toBe(true);
    expect(isOwnerVariant("g")).toBe(false);
    expect(isOwnerVariant("d")).toBe(false);
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

  it("공개 상세(d) 요청은 저장된 wm 객체를 변형 옵션으로 처리해 공개 캐시로 반환한다", async () => {
    photoFindUnique.mockResolvedValue({ r2Key: "products/original/private.jpg", productId: 7n });
    fetchR2Object.mockResolvedValue(r2Object());
    processProductImage.mockResolvedValue(OUTPUT);
    const { customerProductImageResponse } = await import(RESPONSE_MODULE);
    const { productDetailPhotoUrl, MEDIA_VARIANTS } = await import(URL_MODULE);
    const [variant, signature] = await signedParts(productDetailPhotoUrl(7));

    const response = await customerProductImageResponse("photo", 7, variant, signature);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toMatch(/^public/);
    expect(fetchR2Object).toHaveBeenCalledWith("products/original/private.jpg");
    expect(fetchProductPhotoOriginal).not.toHaveBeenCalled();
    expect(processProductImage).toHaveBeenCalledWith(Buffer.from(SOURCE), MEDIA_VARIANTS.d);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(OUTPUT);
    // 공개 변형은 세션·보유를 묻지 않는다
    expect(getCurrentAccount).not.toHaveBeenCalled();
  });

  describe("소유자 컬렉션 변형(cd/cg) — 로그인 + 보유 확인 뒤 clean 원본", () => {
    it("비로그인은 서명이 맞아도 404, 스토리지 미조회", async () => {
      photoFindUnique.mockResolvedValue({ r2Key: "products/original/p.jpg", productId: 7n });
      const { customerProductImageResponse } = await import(RESPONSE_MODULE);
      const { collectionPhotoUrl } = await import(URL_MODULE);
      const [variant, signature] = await signedParts(collectionPhotoUrl(7));

      const response = await customerProductImageResponse("photo", 7, variant, signature);

      expect(response.status).toBe(404);
      expect(fetchProductPhotoOriginal).not.toHaveBeenCalled();
      expect(fetchR2Object).not.toHaveBeenCalled();
    });

    it("로그인했지만 보유하지 않은 상품이면 404", async () => {
      photoFindUnique.mockResolvedValue({ r2Key: "products/original/p.jpg", productId: 7n });
      getCurrentAccount.mockResolvedValue({ id: "acc-1" });
      ownsProduct.mockResolvedValue(false);
      const { customerProductImageResponse } = await import(RESPONSE_MODULE);
      const { collectionPhotoUrl } = await import(URL_MODULE);
      const [variant, signature] = await signedParts(collectionPhotoUrl(7));

      const response = await customerProductImageResponse("photo", 7, variant, signature);

      expect(response.status).toBe(404);
      expect(ownsProduct).toHaveBeenCalledWith("acc-1", 7);
      expect(fetchProductPhotoOriginal).not.toHaveBeenCalled();
    });

    it("보유자는 clean 원본(photo-source)을 읽어 private 캐시로 받는다", async () => {
      photoFindUnique.mockResolvedValue({ r2Key: "products/original/p.jpg", productId: 7n });
      getCurrentAccount.mockResolvedValue({ id: "acc-1" });
      ownsProduct.mockResolvedValue(true);
      fetchProductPhotoOriginal.mockResolvedValue(r2Object());
      processProductImage.mockResolvedValue(OUTPUT);
      const { customerProductImageResponse } = await import(RESPONSE_MODULE);
      const { collectionPhotoUrl, MEDIA_VARIANTS } = await import(URL_MODULE);
      const [variant, signature] = await signedParts(collectionPhotoUrl(7));

      const response = await customerProductImageResponse("photo", 7, variant, signature);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toMatch(/^private/);
      expect(fetchProductPhotoOriginal).toHaveBeenCalledWith("products/original/p.jpg");
      expect(fetchR2Object).not.toHaveBeenCalled();
      expect(processProductImage).toHaveBeenCalledWith(Buffer.from(SOURCE), MEDIA_VARIANTS.cd);
    });

    it("대표 썸네일(cg)도 상품 보유 확인을 거친다", async () => {
      photoFindFirst.mockResolvedValue({ r2Key: "products/original/t.jpg", productId: 34n });
      getCurrentAccount.mockResolvedValue({ id: "acc-1" });
      ownsProduct.mockResolvedValue(true);
      fetchProductPhotoOriginal.mockResolvedValue(r2Object());
      processProductImage.mockResolvedValue(OUTPUT);
      const { customerProductImageResponse } = await import(RESPONSE_MODULE);
      const { collectionThumbnailUrl } = await import(URL_MODULE);
      const [variant, signature] = await signedParts(collectionThumbnailUrl(34));

      const response = await customerProductImageResponse("thumbnail", 34, variant, signature);

      expect(response.status).toBe(200);
      expect(ownsProduct).toHaveBeenCalledWith("acc-1", 34);
    });
  });
});
