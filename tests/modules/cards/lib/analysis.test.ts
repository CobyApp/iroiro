import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2/get", () => ({ fetchR2Object: vi.fn() }));
vi.mock("@/lib/vision/analyze", () => ({ analyzeCardImage: vi.fn() }));

import { fetchR2Object } from "@/lib/r2/get";
import { analyzeCardImage } from "@/lib/vision/analyze";
import {
  analyzeCardFrontByKey,
  rankSimilarCards,
} from "@/modules/cards/lib/analysis";
import type { CardEmbeddingCandidate } from "@/modules/cards/lib/queries";

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeCardFrontByKey", () => {
  it("R2에서 읽어 analyzeCardImage 결과를 반환한다", async () => {
    vi.mocked(fetchR2Object).mockResolvedValue({
      body: streamOf(new Uint8Array([1, 2, 3])),
      contentType: "image/jpeg",
      contentLength: 3,
    });
    vi.mocked(analyzeCardImage).mockResolvedValue({
      embedding: [1, 0],
      model: "m",
    });
    const out = await analyzeCardFrontByKey("cards/original/x.jpg");
    expect(out).toEqual({ embedding: [1, 0], model: "m" });
    expect(analyzeCardImage).toHaveBeenCalledOnce();
  });

  it("R2 읽기 실패면 null (fail-soft, 등록 계속)", async () => {
    vi.mocked(fetchR2Object).mockRejectedValue(new Error("404"));
    expect(await analyzeCardFrontByKey("missing.jpg")).toBeNull();
    expect(analyzeCardImage).not.toHaveBeenCalled();
  });

  it("분석 미설정(null)이면 그대로 null", async () => {
    vi.mocked(fetchR2Object).mockResolvedValue({
      body: streamOf(new Uint8Array([1])),
      contentType: "image/jpeg",
      contentLength: 1,
    });
    vi.mocked(analyzeCardImage).mockResolvedValue(null);
    expect(await analyzeCardFrontByKey("x.jpg")).toBeNull();
  });
});

describe("rankSimilarCards", () => {
  const candidates: CardEmbeddingCandidate[] = [
    {
      id: 1,
      name: "A",
      pose: 1,
      frontR2Key: "a.jpg",
      frontImageUrl: null,
      embedding: [1, 0, 0],
    },
    {
      id: 2,
      name: "B",
      pose: 2,
      frontR2Key: null,
      frontImageUrl: "https://ext/b.jpg",
      embedding: [0, 1, 0],
    },
  ];

  it("매칭에 카드 메타(name·pose·이미지)를 합쳐 반환한다", () => {
    const out = rankSimilarCards([1, 0, 0], candidates, { k: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 1,
      name: "A",
      pose: 1,
      frontR2Key: "a.jpg",
      frontImageUrl: null,
    });
    expect(out[0].score).toBeCloseTo(1);
  });

  it("minScore로 걸러 유사한 카드만 남긴다", () => {
    const out = rankSimilarCards([1, 0, 0], candidates, { minScore: 0.5 });
    expect(out.map((m) => m.id)).toEqual([1]);
  });
});
