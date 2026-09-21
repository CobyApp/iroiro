import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { card: {} } }));
vi.mock("@/modules/auth/dal", () => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/modules/admin/lib/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/modules/cards/lib/analysis", () => ({
  analyzeCardFrontByKey: vi.fn(),
  rankSimilarCards: vi.fn(() => []),
}));
vi.mock("@/modules/cards/lib/queries", () => ({
  listAnalyzedCandidates: vi.fn(async () => []),
  listExistingCards: vi.fn(async () => []),
}));

import { getCurrentAccount } from "@/modules/auth/dal";
import {
  analyzeCardFrontByKey,
  rankSimilarCards,
} from "@/modules/cards/lib/analysis";
import { listAnalyzedCandidates } from "@/modules/cards/lib/queries";
import { findSimilarCards } from "@/modules/cards/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAccount).mockResolvedValue({ id: "acc" } as never);
});

describe("findSimilarCards", () => {
  const input = { frontR2Key: "cards/original/x.jpg", teamId: 1, memberId: 2 };

  it("미로그인이면 거절하고 분석하지 않는다", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(null as never);
    const res = await findSimilarCards(input);
    expect(res).toMatchObject({ ok: false, code: "login_required" });
    expect(analyzeCardFrontByKey).not.toHaveBeenCalled();
  });

  it("입력 검증 실패(빈 frontR2Key)면 invalid_input", async () => {
    const res = await findSimilarCards({ ...input, frontR2Key: "" });
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
    expect(analyzeCardFrontByKey).not.toHaveBeenCalled();
  });

  it("AWS 미설정(analyze=null)이면 configured=false, 후보 조회 없음", async () => {
    vi.mocked(analyzeCardFrontByKey).mockResolvedValue(null);
    const res = await findSimilarCards(input);
    expect(res).toEqual({ ok: true, data: { configured: false, matches: [] } });
    expect(listAnalyzedCandidates).not.toHaveBeenCalled();
  });

  it("happy path — 임베딩으로 같은 그룹/멤버 후보를 랭킹한다", async () => {
    vi.mocked(analyzeCardFrontByKey).mockResolvedValue({
      embedding: [1, 0],
      model: "m",
    });
    const matches = [
      {
        id: 9,
        score: 0.92,
        name: "A",
        pose: 1,
        frontR2Key: "a.jpg",
        frontImageUrl: null,
      },
    ];
    vi.mocked(rankSimilarCards).mockReturnValue(matches);
    const res = await findSimilarCards(input);
    expect(listAnalyzedCandidates).toHaveBeenCalledWith(1, 2);
    expect(res).toEqual({ ok: true, data: { configured: true, matches } });
  });
});
