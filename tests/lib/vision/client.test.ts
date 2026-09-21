import { afterEach, describe, expect, it, vi } from "vitest";

// client.ts는 import 시점에 env를 읽어 자격증명 경로(정적 키 vs 체인)를 정하므로,
// 시나리오별로 doMock + 동적 import로 새로 로드한다.
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

type EnvOverrides = {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  profile?: string;
};

async function loadClient(over: EnvOverrides, chainCreds: unknown = undefined) {
  vi.resetModules();
  const provider = vi.fn(async () => chainCreds);
  const fromNodeProviderChain = vi.fn(() => provider);
  vi.doMock("@aws-sdk/credential-providers", () => ({ fromNodeProviderChain }));
  vi.doMock("@/lib/env", () => ({
    isVisionConfigured: Boolean(over.region),
    env: {
      BEDROCK_REGION: over.region,
      BEDROCK_ACCESS_KEY_ID: over.accessKeyId,
      BEDROCK_SECRET_ACCESS_KEY: over.secretAccessKey,
      BEDROCK_PROFILE: over.profile,
      BEDROCK_EMBED_MODEL_ID: "amazon.titan-embed-image-v1",
    },
  }));
  const mod = await import("@/lib/vision/client");
  return { ...mod, fromNodeProviderChain, provider };
}

describe("getBedrockClient", () => {
  it("리전 미설정이면 자격증명 해석 없이 null", async () => {
    const { getBedrockClient, provider } = await loadClient({});
    expect(await getBedrockClient()).toBeNull();
    // provider(자격증명 해석)는 호출되지 않는다 — 리전 가드에서 먼저 끊긴다.
    expect(provider).not.toHaveBeenCalled();
  });

  it("정적 키가 있으면 체인을 쓰지 않고 클라이언트를 만든다", async () => {
    const { getBedrockClient, fromNodeProviderChain } = await loadClient({
      region: "us-east-1",
      accessKeyId: "AKIA",
      secretAccessKey: "secret",
    });
    const client = await getBedrockClient();
    expect(client).not.toBeNull();
    expect(fromNodeProviderChain).not.toHaveBeenCalled();
  });

  it("정적 키가 없으면 지정한 프로필로 자격증명 체인을 해석한다", async () => {
    const { getBedrockClient, fromNodeProviderChain } = await loadClient(
      { region: "us-east-1", profile: "coby" },
      { accessKeyId: "AKIA", secretAccessKey: "secret" },
    );
    const client = await getBedrockClient();
    expect(client).not.toBeNull();
    expect(fromNodeProviderChain).toHaveBeenCalledWith({ profile: "coby" });
  });

  it("체인이 자격증명을 못 주면 null (fail-soft)", async () => {
    const { getBedrockClient } = await loadClient(
      { region: "us-east-1" },
      { accessKeyId: "", secretAccessKey: "" },
    );
    expect(await getBedrockClient()).toBeNull();
  });

  it("자격증명 해석이 throw해도 null", async () => {
    vi.resetModules();
    const fromNodeProviderChain = vi.fn(() => async () => {
      throw new Error("no creds");
    });
    vi.doMock("@aws-sdk/credential-providers", () => ({ fromNodeProviderChain }));
    vi.doMock("@/lib/env", () => ({
      isVisionConfigured: true,
      env: { BEDROCK_REGION: "us-east-1" },
    }));
    const { getBedrockClient } = await import("@/lib/vision/client");
    expect(await getBedrockClient()).toBeNull();
  });
});

describe("bedrockInvokeUrl", () => {
  it("리전과 URL-인코딩된 modelId로 엔드포인트를 만든다", async () => {
    const { bedrockInvokeUrl } = await loadClient({ region: "us-east-1" });
    expect(bedrockInvokeUrl("amazon.titan-embed-image-v1")).toBe(
      "https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.titan-embed-image-v1/invoke",
    );
  });
});
