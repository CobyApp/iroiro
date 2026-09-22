import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env 는 import 시점에 파싱되므로, 각 케이스에서 stubEnv 후 모듈을 새로 import 한다.
const baseEnv = () => {
  vi.stubEnv("KAKAO_REST_API_KEY", "k");
};

describe("getCheckoutProvider", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("기본(PAYMENT_PROVIDER 미설정)은 mock(immediate)", async () => {
    baseEnv();
    const { getCheckoutProvider } = await import("@/lib/payments/checkout");
    const provider = getCheckoutProvider();
    expect(provider.provider).toBe("mock");
    expect(provider.kind).toBe("immediate");
  });

  it("kakaopay + SECRET 키가 있으면 kakaopay(redirect)", async () => {
    baseEnv();
    vi.stubEnv("PAYMENT_PROVIDER", "kakaopay");
    vi.stubEnv("KAKAO_PAY_SECRET_KEY", "sk_test");
    const { getCheckoutProvider } = await import("@/lib/payments/checkout");
    const provider = getCheckoutProvider();
    expect(provider.provider).toBe("kakaopay");
    expect(provider.kind).toBe("redirect");
  });

  it("kakaopay 라도 SECRET 키가 없으면 mock 으로 폴백(키 없이 안전)", async () => {
    baseEnv();
    vi.stubEnv("PAYMENT_PROVIDER", "kakaopay");
    const { getCheckoutProvider } = await import("@/lib/payments/checkout");
    const provider = getCheckoutProvider();
    expect(provider.provider).toBe("mock");
    expect(provider.kind).toBe("immediate");
  });
});
