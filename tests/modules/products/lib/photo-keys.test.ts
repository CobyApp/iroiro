import { describe, expect, it } from "vitest";
import { productCleanKey } from "@/modules/products/lib/photo-keys";

describe("productCleanKey — 상품 사진 wm/clean 규약", () => {
  it("products/original 키에서 clean 키를 파생한다", () => {
    expect(productCleanKey("products/original/abc.jpg")).toBe("products/clean/abc.jpg");
  });
  it("규약 밖의 키(예전·다른 도메인)는 null — clean 이 없다", () => {
    expect(productCleanKey("used/original/abc.jpg")).toBeNull();
    expect(productCleanKey("products/clean/abc.jpg")).toBeNull();
  });
});
