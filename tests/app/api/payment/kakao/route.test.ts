import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { approveUsedTradePayment, failUsedTradePayment, getCurrentAccount } =
  vi.hoisted(() => ({
    approveUsedTradePayment: vi.fn(),
    failUsedTradePayment: vi.fn(),
    getCurrentAccount: vi.fn(),
  }));
vi.mock("@/modules/used/lib/checkout", () => ({
  approveUsedTradePayment,
  failUsedTradePayment,
}));
vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount }));

import { GET as approveGET } from "@/app/api/payment/kakao/approve/route";
import { GET as cancelGET } from "@/app/api/payment/kakao/cancel/route";
import { GET as failGET } from "@/app/api/payment/kakao/fail/route";

const nreq = (url: string) => new NextRequest(url);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAccount.mockResolvedValue({ id: "buyer" });
});

describe("GET /api/payment/kakao/approve", () => {
  it("승인 성공 시 매물 상세로 리다이렉트(?paid=1)", async () => {
    approveUsedTradePayment.mockResolvedValue({ ok: true, listingId: 10 });
    const res = await approveGET(
      nreq("http://localhost/api/payment/kakao/approve?trade=1&pg_token=tok"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/used/10?paid=1");
    expect(approveUsedTradePayment).toHaveBeenCalledWith(1, "tok", "buyer");
  });

  it("pg_token 누락이면 승인하지 않고 실패 리다이렉트", async () => {
    const res = await approveGET(
      nreq("http://localhost/api/payment/kakao/approve?trade=1"),
    );
    expect(res.headers.get("location")).toContain("payfail=1");
    expect(approveUsedTradePayment).not.toHaveBeenCalled();
  });

  it("승인 실패 시 payfail 로 리다이렉트", async () => {
    approveUsedTradePayment.mockResolvedValue({ ok: false, listingId: 10 });
    const res = await approveGET(
      nreq("http://localhost/api/payment/kakao/approve?trade=1&pg_token=tok"),
    );
    expect(res.headers.get("location")).toContain("/used/10?payfail=1");
  });

  it("로그인하지 않았으면 승인을 호출하지 않는다", async () => {
    getCurrentAccount.mockResolvedValue(null);
    const res = await approveGET(
      nreq("http://localhost/api/payment/kakao/approve?trade=1&pg_token=tok"),
    );
    expect(res.headers.get("location")).toContain("payfail=1");
    expect(approveUsedTradePayment).not.toHaveBeenCalled();
  });
});

describe("GET /api/payment/kakao/cancel·fail", () => {
  it("취소는 대기 거래를 되돌리고 paycancel 로 리다이렉트", async () => {
    failUsedTradePayment.mockResolvedValue({ listingId: 10 });
    const res = await cancelGET(
      nreq("http://localhost/api/payment/kakao/cancel?trade=1"),
    );
    expect(res.headers.get("location")).toContain("/used/10?paycancel=1");
    expect(failUsedTradePayment).toHaveBeenCalledWith(1, "buyer");
  });

  it("실패는 대기 거래를 되돌리고 payfail 로 리다이렉트", async () => {
    failUsedTradePayment.mockResolvedValue({ listingId: 10 });
    const res = await failGET(
      nreq("http://localhost/api/payment/kakao/fail?trade=1"),
    );
    expect(res.headers.get("location")).toContain("/used/10?payfail=1");
  });
});
