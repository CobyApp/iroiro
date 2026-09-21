import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  card: {
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks }));

import {
  getCardAnalysisSummary,
  listAnalyzedCandidates,
} from "@/modules/cards/lib/queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCardAnalysisSummary", () => {
  it("전체/분석/대기 수, 모델별 분포(내림차순·null 제외), 최근 분석 시각을 돌려준다", async () => {
    // count 호출 순서: total → analyzed(analyzedAt not null) → pending
    mocks.card.count
      .mockResolvedValueOnce(120)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(7);
    mocks.card.groupBy.mockResolvedValue([
      { analysisModel: "old-model", _count: { _all: 5 } },
      { analysisModel: null, _count: { _all: 3 } }, // 방어: 모델 없는 행은 제외
      { analysisModel: "amazon.titan-embed-image-v1", _count: { _all: 75 } },
    ]);
    const latest = new Date("2026-09-21T10:00:00.000Z");
    mocks.card.aggregate.mockResolvedValue({ _max: { analyzedAt: latest } });

    const out = await getCardAnalysisSummary();

    expect(out.total).toBe(120);
    expect(out.analyzed).toBe(80);
    expect(out.pending).toBe(7);
    expect(out.byModel).toEqual([
      { model: "amazon.titan-embed-image-v1", count: 75 },
      { model: "old-model", count: 5 },
    ]);
    expect(out.latestAnalyzedAt).toBe(latest.toISOString());
    // "분석됨" 기준은 analyzedAt not null 하나로 통일
    expect(mocks.card.count).toHaveBeenNthCalledWith(2, {
      where: { analyzedAt: { not: null } },
    });
    expect(mocks.card.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { analyzedAt: { not: null } } }),
    );
  });

  it("분석된 카드가 없으면 모델 목록은 빈 배열, 최근 분석은 null", async () => {
    mocks.card.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(3);
    mocks.card.groupBy.mockResolvedValue([]);
    mocks.card.aggregate.mockResolvedValue({ _max: { analyzedAt: null } });

    const out = await getCardAnalysisSummary();

    expect(out).toEqual({
      total: 3,
      analyzed: 0,
      pending: 3,
      byModel: [],
      latestAnalyzedAt: null,
    });
  });
});

describe("listAnalyzedCandidates", () => {
  it("공개+분석된 카드만 그룹/멤버로 좁혀 조회하고 JSONB 임베딩을 숫자 배열로 변환한다", async () => {
    mocks.card.findMany.mockResolvedValue([
      {
        id: BigInt(1),
        name: "A",
        pose: 1,
        frontR2Key: "a.jpg",
        analysisEmbedding: [0.5, "0.25"], // JSON 값이 문자열이어도 Number로 정규화
      },
      {
        id: BigInt(2),
        name: "B",
        pose: 2,
        frontR2Key: null,
        analysisEmbedding: null,
      },
    ]);

    const out = await listAnalyzedCandidates(10, 20);

    expect(mocks.card.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "active",
          analyzedAt: { not: null },
          teamId: BigInt(10),
          memberId: BigInt(20),
        },
      }),
    );
    expect(out[0]).toMatchObject({ id: 1, embedding: [0.5, 0.25] });
    expect(out[1]).toMatchObject({ id: 2, embedding: null });
  });

  it("그룹/멤버가 null이면 해당 조건을 넣지 않는다", async () => {
    mocks.card.findMany.mockResolvedValue([]);
    await listAnalyzedCandidates(null, null);
    const where = mocks.card.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ status: "active", analyzedAt: { not: null } });
  });
});
