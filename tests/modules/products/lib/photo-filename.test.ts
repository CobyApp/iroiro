import { describe, expect, it } from "vitest";
import {
  buildContentDisposition,
  buildPhotoFilename,
  buildZipFilename,
} from "@/modules/products/lib/photo-filename";

describe("buildPhotoFilename", () => {
  it("멤버 있을 때 상품명·멤버명·순번 결합", () => {
    expect(
      buildPhotoFilename({
        productName: "뉴진스 굿즈",
        memberName: "민지",
        displayOrder: 0,
        r2Key: "products/1/123-abc.jpg",
      }),
    ).toBe("뉴진스_굿즈_민지_01.jpg");
  });

  it("멤버 없을 때 멤버명 segment 생략", () => {
    expect(
      buildPhotoFilename({
        productName: "단체 굿즈",
        memberName: null,
        displayOrder: 2,
        r2Key: "products/1/123-abc.png",
      }),
    ).toBe("단체_굿즈_03.png");
  });

  it("위험 문자(/ : * ? 등) 새니타이즈", () => {
    expect(
      buildPhotoFilename({
        productName: "상품/이름:테스트",
        memberName: "민?지",
        displayOrder: 0,
        r2Key: "k.jpg",
      }),
    ).toBe("상품_이름_테스트_민_지_01.jpg");
  });

  it("30자 초과 segment cap (한국어 코드 포인트 단위)", () => {
    const long = "가".repeat(40);
    expect(
      buildPhotoFilename({
        productName: long,
        memberName: null,
        displayOrder: 0,
        r2Key: "k.jpg",
      }),
    ).toBe(`${"가".repeat(30)}_01.jpg`);
  });

  it("확장자 r2Key에서 추출하고 소문자화", () => {
    expect(
      buildPhotoFilename({
        productName: "상품",
        memberName: null,
        displayOrder: 0,
        r2Key: "products/1/foo.JPG",
      }),
    ).toBe("상품_01.jpg");
  });

  it("확장자 없으면 bin fallback", () => {
    expect(
      buildPhotoFilename({
        productName: "상품",
        memberName: null,
        displayOrder: 0,
        r2Key: "products/1/file_no_ext",
      }),
    ).toBe("상품_01.bin");
  });

  it.each([
    [0, "01"],
    [1, "02"],
    [9, "10"],
    [98, "99"],
    [99, "100"],
  ])("displayOrder %i → 순번 %s zero-pad", (order, padded) => {
    expect(
      buildPhotoFilename({
        productName: "상품",
        memberName: null,
        displayOrder: order,
        r2Key: "k.jpg",
      }),
    ).toBe(`상품_${padded}.jpg`);
  });

  it("공백·중복 underscore 정규화", () => {
    expect(
      buildPhotoFilename({
        productName: "  상품  이름  ",
        memberName: "  민  지  ",
        displayOrder: 0,
        r2Key: "k.jpg",
      }),
    ).toBe("상품_이름_민_지_01.jpg");
  });

  it("멤버명 빈 문자열은 NULL과 동일하게 segment 생략", () => {
    expect(
      buildPhotoFilename({
        productName: "상품",
        memberName: "",
        displayOrder: 0,
        r2Key: "k.jpg",
      }),
    ).toBe("상품_01.jpg");
  });

  it("멤버명이 새니타이즈 후 빈 문자열이면 segment 생략", () => {
    expect(
      buildPhotoFilename({
        productName: "상품",
        memberName: "///",
        displayOrder: 0,
        r2Key: "k.jpg",
      }),
    ).toBe("상품_01.jpg");
  });
});

describe("buildZipFilename", () => {
  it("상품명 + .zip 결합", () => {
    expect(buildZipFilename("뉴진스 굿즈")).toBe("뉴진스_굿즈.zip");
  });

  it("빈 상품명은 product.zip", () => {
    expect(buildZipFilename("")).toBe("product.zip");
  });

  it("새니타이즈 후 빈 문자열도 product.zip", () => {
    expect(buildZipFilename("///")).toBe("product.zip");
  });

  it("30자 cap", () => {
    expect(buildZipFilename("가".repeat(40))).toBe(`${"가".repeat(30)}.zip`);
  });
});

describe("buildContentDisposition", () => {
  it("한국어 파일명 RFC 5987 인코딩 포함", () => {
    const cd = buildContentDisposition("뉴진스_01.jpg");
    expect(cd).toMatch(/^attachment;/);
    expect(cd).toContain(
      `filename*=UTF-8''${encodeURIComponent("뉴진스_01.jpg")}`,
    );
  });

  it("ASCII fallback은 비-ASCII 문자를 _로 치환", () => {
    const cd = buildContentDisposition("뉴진스_01.jpg");
    expect(cd).toContain('filename="____01.jpg"');
  });

  it("ASCII 파일명은 그대로 fallback에 사용", () => {
    const cd = buildContentDisposition("photo_01.jpg");
    expect(cd).toContain('filename="photo_01.jpg"');
    expect(cd).toContain("filename*=UTF-8''photo_01.jpg");
  });

  it("따옴표는 ASCII fallback에서 제거", () => {
    const cd = buildContentDisposition('name".jpg');
    expect(cd).toContain('filename="name.jpg"');
  });
});
