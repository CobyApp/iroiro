import "server-only";

import { env, isVisionConfigured } from "@/lib/env";
import { getBedrockClient, bedrockInvokeUrl } from "./client";
import { l2Normalize } from "./similarity";
import type { ImageAnalysis } from "./types";

// 카드 이미지 임베딩 — AWS Bedrock Titan Multimodal Embeddings.
// 토레카분석기 core/embedder.py(DINOv2+SigLIP 앙상블)의 역할을 AWS 관리형 모델로 대체한 포팅.
// oshikore와 동일한 계약: 출력은 L2 정규화된 단일 벡터 → 카탈로그와 코사인 비교(core/matcher.py).
//
// fail-soft: 자격증명 미설정·API 실패·응답 이상이면 예외를 던지지 않고 null을 반환한다.
// 이미지 분석은 등록의 부가 데이터이지 전제조건이 아니므로, 호출부는 null을 "미분석"으로 다룬다.

const TITAN_MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Titan 이미지 입력 상한(base64 전 원본 기준 보수값)

export async function analyzeCardImage(
  imageBytes: Buffer | Uint8Array,
): Promise<ImageAnalysis | null> {
  if (!isVisionConfigured) return null;
  if (imageBytes.byteLength === 0 || imageBytes.byteLength > TITAN_MAX_IMAGE_BYTES) {
    return null;
  }
  const bedrock = await getBedrockClient();
  if (!bedrock) return null;

  const modelId = env.BEDROCK_EMBED_MODEL_ID;
  const base64 = Buffer.from(imageBytes).toString("base64");
  const body = JSON.stringify({
    inputImage: base64,
    embeddingConfig: { outputEmbeddingLength: env.BEDROCK_EMBED_DIMENSION },
  });

  try {
    const signed = await bedrock.sign(
      new Request(bedrockInvokeUrl(modelId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      }),
    );
    const res = await fetch(signed);
    if (!res.ok) return null;

    const json = (await res.json()) as { embedding?: unknown };
    const raw = json.embedding;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const vec = raw.map(Number);
    if (vec.some((n) => !Number.isFinite(n))) return null;

    // Titan은 이미 정규화된 벡터를 주지만, 매칭이 정규화를 전제로 하므로 방어적으로 한 번 더.
    return { embedding: l2Normalize(vec), model: modelId };
  } catch {
    return null;
  }
}
