import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  l2Normalize,
  rankBySimilarity,
} from "@/lib/vision/similarity";

describe("l2Normalize", () => {
  it("단위 벡터로 정규화한다 (길이 1)", () => {
    const out = l2Normalize([3, 4]);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.8);
    expect(Math.hypot(...out)).toBeCloseTo(1);
  });

  it("영벡터는 0 나눗셈 없이 원본을 반환한다", () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("cosineSimilarity", () => {
  it("동일 방향 벡터는 1", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("직교 벡터는 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("반대 방향 벡터는 -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it("차원이 다르거나 비면 0 (방어)", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("rankBySimilarity", () => {
  const query = [1, 0, 0];
  const candidates = [
    { id: 1, embedding: [1, 0, 0] }, // score 1
    { id: 2, embedding: [0, 1, 0] }, // score 0
    { id: 3, embedding: [0.9, 0.1, 0] }, // 높은 유사
    { id: 4, embedding: null }, // 임베딩 없음 → 제외
  ];

  it("점수 내림차순으로 Top-K를 반환한다", () => {
    const out = rankBySimilarity(query, candidates, { k: 2 });
    expect(out.map((m) => m.id)).toEqual([1, 3]);
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it("minScore 미만은 버린다", () => {
    const out = rankBySimilarity(query, candidates, { minScore: 0.5 });
    expect(out.map((m) => m.id)).toEqual([1, 3]);
    expect(out.some((m) => m.id === 2)).toBe(false);
  });

  it("임베딩 없는 후보는 건너뛴다", () => {
    const out = rankBySimilarity(query, candidates);
    expect(out.some((m) => m.id === 4)).toBe(false);
  });

  it("빈 쿼리는 빈 배열", () => {
    expect(rankBySimilarity([], candidates)).toEqual([]);
  });
});
