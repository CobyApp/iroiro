import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { autoConfirmDueOrders } = vi.hoisted(() => ({
  autoConfirmDueOrders: vi.fn(),
}));
vi.mock("@/modules/orders/lib/settle-order", () => ({ autoConfirmDueOrders }));

import { GET } from "@/app/api/cron/auto-confirm-orders/route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/auto-confirm-orders", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  autoConfirmDueOrders.mockResolvedValue(2);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/auto-confirm-orders", () => {
  it("CRON_SECRET 미설정 시 무인증으로 스윕하고 건수를 반환한다", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, confirmed: 2 });
  });

  it("CRON_SECRET 설정 + Bearer 불일치 → 401(스윕 안 함)", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(autoConfirmDueOrders).not.toHaveBeenCalled();
  });

  it("CRON_SECRET 설정 + Bearer 일치 → 200", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(autoConfirmDueOrders).toHaveBeenCalledOnce();
  });
});
