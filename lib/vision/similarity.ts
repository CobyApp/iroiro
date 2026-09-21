// 임베딩 유사도 — 토레카분석기 core/matcher.py의 TypeScript 포팅.
// 정규화 벡터끼리의 코사인 = 내적. 순수 함수라 서버·클라이언트·테스트 어디서나 쓴다.

import type { SimilarityMatch } from "./types";

const EPS = 1e-12;

/** L2 정규화 — 길이가 0이면 원본을 그대로 반환(0 나눗셈 방지). */
export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm < EPS) return vec.slice();
  return vec.map((v) => v / norm);
}

/** 코사인 유사도. 차원이 다르거나 비면 0. 내부에서 정규화하므로 원본 벡터도 안전. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom < EPS) return 0;
  return dot / denom;
}

/**
 * 쿼리 벡터와 후보들의 Top-K 코사인 매칭 (core/matcher.py top_matches 대응).
 * minScore 미만은 버린다. 임베딩이 없는(null) 후보는 건너뛴다.
 */
export function rankBySimilarity(
  query: number[],
  candidates: { id: number; embedding: number[] | null }[],
  { k = 5, minScore = 0 }: { k?: number; minScore?: number } = {},
): SimilarityMatch[] {
  if (query.length === 0) return [];
  const scored: SimilarityMatch[] = [];
  for (const c of candidates) {
    if (!c.embedding || c.embedding.length === 0) continue;
    const score = cosineSimilarity(query, c.embedding);
    if (score >= minScore) scored.push({ id: c.id, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, k);
}
