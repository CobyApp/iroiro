import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { autoConfirmDueUsedTrades } = vi.hoisted(() => ({
  autoConfirmDueUsedTrades: vi.fn(),
}));
vi.mock("@/modules/used/lib/settle-trade", () => ({ autoConfirmDueUsedTrades }));

import { GET } from "@/app/api/cron/auto-confirm-used/route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/auto-confirm-used", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  autoConfirmDueUsedTrades.mockResolvedValue(3);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/auto-confirm-used", () => {
  it("CRON_SECRET 미설정 시 무인증으로 스윕하고 건수를 반환한다", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, confirmed: 3 });
  });

  it("CRON_SECRET 설정 + Bearer 불일치 → 401(스윕 안 함)", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(autoConfirmDueUsedTrades).not.toHaveBeenCalled();
  });

  it("CRON_SECRET 설정 + Bearer 일치 → 200", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(autoConfirmDueUsedTrades).toHaveBeenCalledOnce();
  });
});
