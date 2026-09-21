import "server-only";

import { fetchCatalogObject, readObjectBytes } from "@/lib/r2/catalog";
import { analyzeCardImage } from "@/lib/vision/analyze";
import { rankBySimilarity } from "@/lib/vision/similarity";
import type { ImageAnalysis, SimilarityMatch } from "@/lib/vision/types";
import { cardCleanKey } from "./image-keys";
import type { CardEmbeddingCandidate } from "./queries";

// 카드 도메인 ↔ lib/vision 접착부. 카탈로그 버킷의 앞면을 읽어 임베딩하고, 유사 카드 랭킹을 만든다.
// 임베딩 입력은 **clean 원본**을 우선한다 — 워터마크가 없는 쪽이 유사도가 정확하다. clean 이 없는
// 예전 키는 wm 으로 폴백한다.

async function readFrontBytes(frontR2Key: string): Promise<Buffer> {
  const clean = cardCleanKey(frontR2Key);
  if (clean) {
    try {
      return await readObjectBytes(await fetchCatalogObject(clean));
    } catch {
      // clean 미존재 → wm 폴백
    }
  }
  return readObjectBytes(await fetchCatalogObject(frontR2Key));
}

// 앞면 키 → 임베딩. 스토리지 읽기 실패나 미설정(AWS)에서는 null(등록은 계속 진행).
export async function analyzeCardFrontByKey(
  frontR2Key: string,
): Promise<ImageAnalysis | null> {
  try {
    const bytes = await readFrontBytes(frontR2Key);
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
