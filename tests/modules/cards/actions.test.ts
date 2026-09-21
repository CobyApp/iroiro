import { beforeEach, describe, expect, it, vi } from "vitest";

// db는 hoisted 팩토리로 — vi.mock이 파일 상단으로 끌어올려지므로 일반 const 참조는 undefined가 된다.
const mocks = vi.hoisted(() => ({
  card: {
    count: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  member: { findUnique: vi.fn() },
  series: { findUnique: vi.fn() },
  pointTransaction: { create: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: mocks }));
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
import {
  approveCards,
  findSimilarCards,
  reviewCard,
  submitCardReport,
} from "@/modules/cards/actions";

const FRONT = "cards/original/f.jpg";
const ANALYSIS = { embedding: [1, 0], model: "amazon.titan-embed-image-v1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAccount).mockResolvedValue({ id: "acc" } as never);
  // buildCardName / nextPose 공통 픽스처
  mocks.member.findUnique.mockResolvedValue({ name: "미유" });
  mocks.series.findUnique.mockResolvedValue({ label: "봄" });
  mocks.card.aggregate.mockResolvedValue({ _max: { pose: 2 } });
  mocks.card.update.mockResolvedValue({});
  mocks.pointTransaction.create.mockResolvedValue({});
});

// AI 분석 타이밍 정책: 유저 제보 접수 시엔 분석하지 않고, 관리자가 승인(=우리 데이터로 저장)할 때 분석한다.
describe("submitCardReport — 유저 제보는 AI 분석 없이 접수", () => {
  const input = {
    itemType: "photocard",
    teamId: 1,
    memberId: 2,
    seriesId: 3,
    frontR2Key: FRONT,
  };

  it("접수 시 analyzeCardFrontByKey를 호출하지 않고 분석 필드 없이 pending으로 저장한다", async () => {
    mocks.card.count.mockResolvedValue(0);
    mocks.card.create.mockResolvedValue({ id: BigInt(7) });

    const res = await submitCardReport(input);

    expect(res).toEqual({ ok: true, data: { id: 7 } });
    expect(analyzeCardFrontByKey).not.toHaveBeenCalled();
    const data = mocks.card.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: "pending",
      submittedByAccountId: "acc",
      name: "미유 · 봄",
      pose: 3,
      frontR2Key: FRONT,
    });
    expect(data).not.toHaveProperty("analysisEmbedding");
    expect(data).not.toHaveProperty("analyzedAt");
  });

  it("미로그인이면 거절한다", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(null as never);
    const res = await submitCardReport(input);
    expect(res).toMatchObject({ ok: false, code: "login_required" });
    expect(mocks.card.create).not.toHaveBeenCalled();
  });

  it("검수 대기 10건 이상이면 too_many_pending", async () => {
    mocks.card.count.mockResolvedValue(10);
    const res = await submitCardReport(input);
    expect(res).toMatchObject({ ok: false, code: "too_many_pending" });
    expect(mocks.card.create).not.toHaveBeenCalled();
  });
});

describe("reviewCard — 승인 시점에 분석·저장", () => {
  const pendingRow = {
    id: BigInt(5),
    status: "pending",
    submittedByAccountId: "u1",
    frontR2Key: FRONT,
  };

  it("approve — 앞면을 분석해 임베딩·모델·analyzedAt을 함께 저장하고 100P 적립", async () => {
    mocks.card.findUnique.mockResolvedValue(pendingRow);
    vi.mocked(analyzeCardFrontByKey).mockResolvedValue(ANALYSIS);

    const res = await reviewCard(5, "approve");

    expect(res).toEqual({ ok: true, data: undefined });
    expect(analyzeCardFrontByKey).toHaveBeenCalledWith(FRONT);
    expect(mocks.card.update).toHaveBeenCalledWith({
      where: { id: BigInt(5) },
      data: expect.objectContaining({
        status: "active",
        analysisEmbedding: [1, 0],
        analysisModel: ANALYSIS.model,
        analyzedAt: expect.any(Date),
      }),
    });
    expect(mocks.pointTransaction.create).toHaveBeenCalledOnce();
  });

  it("approve — AWS 미설정(analyze=null)이어도 분석 없이 승인은 진행(fail-soft)", async () => {
    mocks.card.findUnique.mockResolvedValue(pendingRow);
    vi.mocked(analyzeCardFrontByKey).mockResolvedValue(null);

    const res = await reviewCard(5, "approve");

    expect(res.ok).toBe(true);
    const data = mocks.card.update.mock.calls[0][0].data;
    expect(data.status).toBe("active");
    expect(data).not.toHaveProperty("analysisModel");
  });

  it("reject — 분석하지 않고 반려 사유만 기록, 적립 없음", async () => {
    mocks.card.findUnique.mockResolvedValue(pendingRow);

    const res = await reviewCard(5, "reject", " 흐림 ");

    expect(res.ok).toBe(true);
    expect(analyzeCardFrontByKey).not.toHaveBeenCalled();
    const data = mocks.card.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "rejected", reviewNote: "흐림" });
    expect(data).not.toHaveProperty("analyzedAt");
    expect(mocks.pointTransaction.create).not.toHaveBeenCalled();
  });

  it("카드가 없으면 not_found", async () => {
    mocks.card.findUnique.mockResolvedValue(null);
    const res = await reviewCard(99, "approve");
    expect(res).toMatchObject({ ok: false, code: "not_found" });
    expect(mocks.card.update).not.toHaveBeenCalled();
  });
});

describe("approveCards — 일괄 승인은 카드별로 분석해 저장", () => {
  it("앞면이 있는 카드만 분석하고, 각 카드를 개별 update한다", async () => {
    // 1번째 findMany = 적립 대상, 2번째 = 승인 대상(앞면 키 포함)
    mocks.card.findMany
      .mockResolvedValueOnce([{ id: BigInt(1), submittedByAccountId: "u1" }])
      .mockResolvedValueOnce([
        { id: BigInt(1), frontR2Key: "a.jpg" },
        { id: BigInt(2), frontR2Key: null },
      ]);
    vi.mocked(analyzeCardFrontByKey).mockResolvedValue(ANALYSIS);

    const res = await approveCards([1, 2]);

    expect(res).toEqual({ ok: true, data: { approved: 2 } });
    // 앞면 없는 2번은 분석 스킵
    expect(analyzeCardFrontByKey).toHaveBeenCalledTimes(1);
    expect(analyzeCardFrontByKey).toHaveBeenCalledWith("a.jpg");
    expect(mocks.card.update).toHaveBeenCalledTimes(2);
    const byId = new Map(
      mocks.card.update.mock.calls.map((c) => [String(c[0].where.id), c[0].data]),
    );
    expect(byId.get("1")).toMatchObject({
      status: "active",
      analysisModel: ANALYSIS.model,
    });
    expect(byId.get("2")).toMatchObject({ status: "active" });
    expect(byId.get("2")).not.toHaveProperty("analysisModel");
    // 적립은 유저 제보 대상(1번)만
    expect(mocks.pointTransaction.create).toHaveBeenCalledOnce();
  });

  it("선택이 비면 거절", async () => {
    const res = await approveCards([]);
    expect(res.ok).toBe(false);
    expect(mocks.card.findMany).not.toHaveBeenCalled();
  });
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
      },
    ];
    vi.mocked(rankSimilarCards).mockReturnValue(matches);
    const res = await findSimilarCards(input);
    expect(listAnalyzedCandidates).toHaveBeenCalledWith(1, 2);
    expect(res).toEqual({ ok: true, data: { configured: true, matches } });
  });
});
