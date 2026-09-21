import { afterEach, describe, expect, it, vi } from "vitest";

// analyze.ts는 import 시점에 env의 isVisionConfigured / client.bedrock를 캡처하므로,
// 설정 유무를 토글하려면 doMock + 동적 import로 모듈을 새로 로드한다.
const realFetch = global.fetch;

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  global.fetch = realFetch;
});

async function loadAnalyze(configured: boolean) {
  vi.resetModules();
  const sign = vi.fn(async (req: Request) => req);
  vi.doMock("@/lib/env", () => ({
    isVisionConfigured: configured,
    env: {
      BEDROCK_EMBED_MODEL_ID: "amazon.titan-embed-image-v1",
      BEDROCK_EMBED_DIMENSION: 8,
      BEDROCK_REGION: "ap-northeast-1",
    },
  }));
  vi.doMock("@/lib/vision/client", () => ({
    getBedrockClient: vi.fn(async () => (configured ? { sign } : null)),
    bedrockInvokeUrl: (m: string) => `https://bedrock-runtime.test/model/${m}/invoke`,
  }));
  const mod = await import("@/lib/vision/analyze");
  return { analyzeCardImage: mod.analyzeCardImage, sign };
}

const IMG = Buffer.from("fake-image-bytes");

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
}

describe("analyzeCardImage", () => {
  it("AWS 미설정이면 fetch 없이 null", async () => {
    const { analyzeCardImage } = await loadAnalyze(false);
    global.fetch = vi.fn();
    expect(await analyzeCardImage(IMG)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("happy path — 정규화된 임베딩과 모델명을 반환한다", async () => {
    const { analyzeCardImage, sign } = await loadAnalyze(true);
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ embedding: [3, 4] }));
    const out = await analyzeCardImage(IMG);
    expect(sign).toHaveBeenCalledOnce();
    expect(out?.model).toBe("amazon.titan-embed-image-v1");
    // L2 정규화 확인 (3,4 → 0.6,0.8)
    expect(out?.embedding[0]).toBeCloseTo(0.6);
    expect(out?.embedding[1]).toBeCloseTo(0.8);
  });

  it("Bedrock 응답이 실패(non-2xx)면 null", async () => {
    const { analyzeCardImage } = await loadAnalyze(true);
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({}, false));
    expect(await analyzeCardImage(IMG)).toBeNull();
  });

  it("embedding이 없거나 비정상이면 null", async () => {
    const { analyzeCardImage } = await loadAnalyze(true);
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ embedding: [] }));
    expect(await analyzeCardImage(IMG)).toBeNull();

    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ embedding: ["x", null] }));
    expect(await analyzeCardImage(IMG)).toBeNull();
  });

  it("fetch가 throw해도 null로 fail-soft", async () => {
    const { analyzeCardImage } = await loadAnalyze(true);
    global.fetch = vi.fn().mockRejectedValue(new Error("network"));
    expect(await analyzeCardImage(IMG)).toBeNull();
  });

  it("빈 바이트는 호출 없이 null", async () => {
    const { analyzeCardImage } = await loadAnalyze(true);
    global.fetch = vi.fn();
    expect(await analyzeCardImage(Buffer.alloc(0))).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
