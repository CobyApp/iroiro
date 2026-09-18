import { describe, expect, it } from "vitest";
import {
  averageRating,
  canReviewOrderStatus,
  maskReviewerName,
} from "@/modules/reviews/lib/rules";
import { reviewUpsertSchema } from "@/modules/reviews/lib/schema";

describe("canReviewOrderStatus", () => {
  it("발송 이후(shipped·delivered)만 리뷰 가능", () => {
    expect(canReviewOrderStatus("shipped")).toBe(true);
    expect(canReviewOrderStatus("delivered")).toBe(true);
    expect(canReviewOrderStatus("pending")).toBe(false);
    expect(canReviewOrderStatus("paid")).toBe(false);
    expect(canReviewOrderStatus("canceled")).toBe(false);
  });
});

describe("maskReviewerName", () => {
  it("첫 글자 + 최대 4개의 *", () => {
    expect(maskReviewerName("도영")).toBe("도*");
    expect(maskReviewerName("김도영님")).toBe("김***");
    expect(maskReviewerName("verylongname")).toBe("v****");
  });

  it("빈 이름·한 글자는 익명 처리 규칙", () => {
    expect(maskReviewerName("")).toBe("익명**");
    expect(maskReviewerName("a")).toBe("a**");
  });
});

describe("averageRating", () => {
  it("소수 첫째 자리 반올림", () => {
    expect(averageRating([5, 4])).toBe(4.5);
    expect(averageRating([5, 4, 4])).toBe(4.3);
    expect(averageRating([1])).toBe(1);
  });

  it("리뷰 없으면 null", () => {
    expect(averageRating([])).toBeNull();
  });
});

describe("reviewUpsertSchema", () => {
  it("정상 입력 통과 + body trim", () => {
    const parsed = reviewUpsertSchema.parse({
      orderId: 1,
      productId: 2,
      rating: 5,
      body: "  좋아요  ",
    });
    expect(parsed.body).toBe("좋아요");
  });

  it("별점 범위(1~5) 밖은 거부", () => {
    expect(() =>
      reviewUpsertSchema.parse({ orderId: 1, productId: 2, rating: 0, body: "" }),
    ).toThrow();
    expect(() =>
      reviewUpsertSchema.parse({ orderId: 1, productId: 2, rating: 6, body: "" }),
    ).toThrow();
  });
});
