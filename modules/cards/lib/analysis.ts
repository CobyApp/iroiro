import "server-only";

import { fetchR2Object } from "@/lib/r2/get";
import { analyzeCardImage } from "@/lib/vision/analyze";
import { rankBySimilarity } from "@/lib/vision/similarity";
import type { ImageAnalysis, SimilarityMatch } from "@/lib/vision/types";
import type { CardEmbeddingCandidate } from "./queries";

// 카드 도메인 ↔ lib/vision 접착부. R2에 저장된 앞면(정규화 완료)을 읽어 임베딩하고,
// 유사 카드 랭킹을 만든다. 토레카분석기의 "등록 시 1회 임베딩 + 저장 전 비교" 흐름 포팅.

async function readObjectBytes(r2Key: string): Promise<Buffer> {
  const obj = await fetchR2Object(r2Key);
  const reader = obj.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// 앞면 R2 키 → 임베딩. 스토리지 읽기 실패나 미설정(AWS)에서는 null(등록은 계속 진행).
export async function analyzeCardFrontByKey(
  frontR2Key: string,
): Promise<ImageAnalysis | null> {
  try {
    const bytes = await readObjectBytes(frontR2Key);
    return await analyzeCardImage(bytes);
  } catch {
    return null;
  }
}

// 쿼리 임베딩 + 후보 → 카드 정보가 붙은 Top-K 매칭. UI가 바로 그릴 수 있게 이름/이미지까지 합친다.
export type SimilarCard = SimilarityMatch & {
  name: string;
  pose: number;
  frontR2Key: string | null;
};

export function rankSimilarCards(
  query: number[],
  candidates: CardEmbeddingCandidate[],
  opts: { k?: number; minScore?: number } = {},
): SimilarCard[] {
  const matches = rankBySimilarity(query, candidates, opts);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return matches.map((m) => {
    const c = byId.get(m.id)!;
    return {
      id: m.id,
      score: m.score,
      name: c.name,
      pose: c.pose,
      frontR2Key: c.frontR2Key,
    };
  });
}
