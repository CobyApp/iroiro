import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzeCardImage } from "@/lib/vision/analyze";
import { cosineSimilarity, rankBySimilarity } from "@/lib/vision/similarity";
import { isVisionConfigured } from "@/lib/env";

// 실제 AWS Bedrock을 호출하는 통합 테스트 — 앱의 새 경로(aws4fetch SigV4 서명 + AWS
// 자격증명 체인)가 정말로 임베딩을 받아오는지 end-to-end로 확인한다.
//
// 실행: RUN_INTEGRATION=1 BEDROCK_REGION=us-east-1 BEDROCK_PROFILE=coby \
//         npx vitest run tests/integration/vision-bedrock.integration.test.ts
// 자격증명/리전이 없으면(로컬 기본) 자동 skip — CI·일반 개발을 막지 않는다.
const enabled = process.env.RUN_INTEGRATION === "1" && isVisionConfigured;

async function cardJpeg(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 256, height: 357, channels: 3, background: { r, g, b } },
  })
    .jpeg({ quality: 82 })
    .toBuffer();
}

describe.skipIf(!enabled)("Bedrock 이미지 임베딩 (실제 호출)", () => {
  it("앞면 이미지를 임베딩해 정규화된 벡터를 반환한다", async () => {
    const analysis = await analyzeCardImage(await cardJpeg(220, 90, 140));
    expect(analysis).not.toBeNull();
    expect(analysis!.model).toContain("titan-embed-image");
    // 기본 1024차원 + L2 정규화(길이 ≈ 1)
    expect(analysis!.embedding.length).toBe(1024);
    const norm = Math.hypot(...analysis!.embedding);
    expect(norm).toBeCloseTo(1, 3);
  }, 30_000);

  it("같은 이미지는 높은 유사도, 다른 이미지는 낮은 유사도", async () => {
    const [a1, a2, bDiff] = await Promise.all([
      analyzeCardImage(await cardJpeg(220, 90, 140)),
      analyzeCardImage(await cardJpeg(220, 90, 140)),
      analyzeCardImage(await cardJpeg(20, 120, 220)),
    ]);
    expect(a1 && a2 && bDiff).toBeTruthy();

    const same = cosineSimilarity(a1!.embedding, a2!.embedding);
    const diff = cosineSimilarity(a1!.embedding, bDiff!.embedding);
    expect(same).toBeGreaterThan(diff);

    // rankBySimilarity가 같은 이미지를 1순위로 올린다
    const ranked = rankBySimilarity(a1!.embedding, [
      { id: 1, embedding: a2!.embedding },
      { id: 2, embedding: bDiff!.embedding },
    ]);
    expect(ranked[0].id).toBe(1);
  }, 30_000);
});
