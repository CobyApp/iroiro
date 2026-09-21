import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/r2/catalog", () => ({
  fetchCatalogObject: vi.fn(),
  readObjectBytes: vi.fn(async (obj: { body: ReadableStream<Uint8Array> }) =>
    Buffer.from(await new Response(obj.body).arrayBuffer()),
  ),
}));
vi.mock("@/lib/vision/analyze", () => ({ analyzeCardImage: vi.fn() }));

import { fetchCatalogObject } from "@/lib/r2/catalog";
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

function obj(bytes: number[]) {
  return {
    body: streamOf(new Uint8Array(bytes)),
    contentType: "image/jpeg",
    contentLength: bytes.length,
  };
}

const WM = "cards/wm/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jpg";
const CLEAN = "cards/clean/0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b.jpg";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analyzeCardFrontByKey", () => {
  it("wm 키를 받으면 clean 원본을 읽어 임베딩한다(워터마크 없는 쪽이 정확)", async () => {
    vi.mocked(fetchCatalogObject).mockResolvedValue(obj([1, 2, 3]));
    vi.mocked(analyzeCardImage).mockResolvedValue({ embedding: [1, 0], model: "m" });

    const out = await analyzeCardFrontByKey(WM);

    expect(out).toEqual({ embedding: [1, 0], model: "m" });
    expect(fetchCatalogObject).toHaveBeenCalledTimes(1);
    expect(fetchCatalogObject).toHaveBeenCalledWith(CLEAN);
    expect(analyzeCardImage).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it("clean 이 없으면 wm 으로 폴백한다", async () => {
    vi.mocked(fetchCatalogObject)
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce(obj([9]));
    vi.mocked(analyzeCardImage).mockResolvedValue({ embedding: [0, 1], model: "m" });

    const out = await analyzeCardFrontByKey(WM);

    expect(out).toEqual({ embedding: [0, 1], model: "m" });
    expect(vi.mocked(fetchCatalogObject).mock.calls.map((c) => c[0])).toEqual([CLEAN, WM]);
  });

  it("규약 밖 키(예전 cards/original)는 그 키를 바로 읽는다", async () => {
    vi.mocked(fetchCatalogObject).mockResolvedValue(obj([1]));
    vi.mocked(analyzeCardImage).mockResolvedValue({ embedding: [1], model: "m" });

    await analyzeCardFrontByKey("cards/original/x.jpg");

    expect(fetchCatalogObject).toHaveBeenCalledTimes(1);
    expect(fetchCatalogObject).toHaveBeenCalledWith("cards/original/x.jpg");
  });

  it("스토리지 읽기 실패면 null (fail-soft, 등록 계속)", async () => {
    vi.mocked(fetchCatalogObject).mockRejectedValue(new Error("404"));
    expect(await analyzeCardFrontByKey("missing.jpg")).toBeNull();
    expect(analyzeCardImage).not.toHaveBeenCalled();
  });

  it("분석 미설정(null)이면 그대로 null", async () => {
    vi.mocked(fetchCatalogObject).mockResolvedValue(obj([1]));
    vi.mocked(analyzeCardImage).mockResolvedValue(null);
    expect(await analyzeCardFrontByKey("x.jpg")).toBeNull();
  });
});

describe("rankSimilarCards", () => {
  const candidates: CardEmbeddingCandidate[] = [
    { id: 1, name: "A", pose: 1, frontR2Key: "a.jpg", embedding: [1, 0, 0] },
    { id: 2, name: "B", pose: 2, frontR2Key: null, embedding: [0, 1, 0] },
  ];

  it("매칭에 카드 메타(name·pose·이미지)를 합쳐 반환한다", () => {
    const out = rankSimilarCards([1, 0, 0], candidates, { k: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 1, name: "A", pose: 1, frontR2Key: "a.jpg" });
    expect(out[0].score).toBeCloseTo(1);
  });

  it("minScore로 걸러 유사한 카드만 남긴다", () => {
    const out = rankSimilarCards([1, 0, 0], candidates, { minScore: 0.5 });
    expect(out.map((m) => m.id)).toEqual([1]);
  });
});
