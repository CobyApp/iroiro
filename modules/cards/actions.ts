"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { catalogDb } from "@/lib/catalog-db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { catalogPublicUrl } from "@/lib/r2/catalog";
import { deployEnvName } from "@/lib/app-name";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import {
  getRegistrationHint,
  listAnalyzedCandidates,
  listExistingCards,
  type RegistrationHint,
} from "./lib/queries";
import { storeCardFrontImage } from "./lib/image-storage";
import {
  analyzeCardFrontByKey,
  rankSimilarCards,
  type SimilarCard,
} from "./lib/analysis";
import { cardImageSrc, type Card, type CardImageView } from "./types";

// 유사 카드 매칭 파라미터 — 노이즈를 줄이는 최소 유사도와 표시 개수.
const SIMILAR_MIN_SCORE = 0.5;
const SIMILAR_TOP_K = 6;

// 앞면 R2 키를 분석해 Prisma create/update에 넣을 분석 필드로 변환한다.
// 호출 시점 = "우리 데이터로 저장하는 순간"만: 관리자 직접 등록, 제보 승인. 유저 제보 접수
// 시점에는 호출하지 않는다(접수는 가볍게, 분석은 카탈로그 검수에서).
// AWS 미설정·분석 실패면 빈 객체 — 저장은 분석 없이 진행(fail-soft).
async function analysisFields(frontR2Key: string): Promise<{
  analysisEmbedding?: number[];
  analysisModel?: string;
  analyzedAt?: Date;
}> {
  const analysis = await analyzeCardFrontByKey(frontR2Key);
  if (!analysis) return {};
  return {
    analysisEmbedding: analysis.embedding,
    analysisModel: analysis.model,
    analyzedAt: new Date(),
  };
}

// 토레카 마스터 액션 — 관리자 CRUD + 유저 제보(검수 대기) + 검수 승인/반려.

const MAX_FILE_BYTES = 8 * 1024 * 1024;
// 서버가 저장 직전에 63:88·720px·JPEG q72로 정규화하므로 입력 포맷은 sharp가 여는 것이면 된다
// (HEIC은 리눅스 sharp 기본 빌드에 디코더가 없어 제외). 클라이언트는 사전 축소만 담당한다.
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const cardInputSchema = z.object({
  itemType: z.string().trim().min(1).max(50).default("photocard"),
  teamId: z.number().int().positive({ message: "그룹을 선택해주세요" }),
  memberId: z.number().int().positive({ message: "멤버를 선택해주세요" }),
  seriesId: z.number().int().positive({ message: "시리즈를 선택해주세요" }),
  frontR2Key: z.string().trim().min(1, "앞면 이미지를 올려주세요"),
  itemCode: z.string().trim().max(120).optional(),
  retailPriceJpy: z.number().int().min(0).optional(),
});

// 포즈 번호 자동 부여 — 같은 (시리즈, 멤버)의 다음 순번.
async function nextPose(memberId: number, seriesId: number): Promise<number> {
  const agg = await catalogDb.card.aggregate({
    where: { memberId: BigInt(memberId), seriesId: BigInt(seriesId) },
    _max: { pose: true },
  });
  return (agg._max.pose ?? 0) + 1;
}

// 카드 이름 자동 생성 — 분석기와 같은 "멤버 · 시리즈" 규칙.
async function buildCardName(
  memberId: number,
  seriesId: number,
): Promise<string> {
  const [member, series] = await Promise.all([
    catalogDb.member.findUnique({
      where: { id: BigInt(memberId) },
      select: { name: true },
    }),
    catalogDb.series.findUnique({
      where: { id: BigInt(seriesId) },
      select: { label: true },
    }),
  ]);
  if (!member) throw new DomainError("멤버를 찾을 수 없어요", "not_found");
  if (!series) throw new DomainError("시리즈를 찾을 수 없어요", "not_found");
  return `${member.name} · ${series.label}`;
}

export type CardInput = z.infer<typeof cardInputSchema>;

function parse(input: CardInput) {
  const parsed = cardInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError(
      parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      "invalid_input",
    );
  }
  return parsed.data;
}

function revalidateCards() {
  revalidatePath("/catalog/cards");
  revalidatePath("/cards/new");
}

// 앞면 이미지 업로드 — 서버 경유. 토레카는 앞면만 보관한다. 저장 직전에 서버가 규격으로
// 정규화한다(EXIF 보정 → 63:88 중앙 크롭 → 720×1006 → JPEG q72 progressive) — clean(원본)과
// wm(워터마크) 두 벌을 카탈로그 버킷에 올리고 DB 에는 wm 키를 둔다. 미리보기는 관리자면 clean
// (관리자 라우트), 일반 회원이면 공개 wm URL.
export async function uploadCardPhoto(
  formData: FormData,
): Promise<ActionResult<{ r2Key: string; previewUrl: string }>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const file = formData.get("file");
    if (!(file instanceof Blob)) throw new DomainError("파일이 없습니다");
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new DomainError(`지원하지 않는 포맷: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new DomainError("파일 크기 초과 (8MB 이하)");
    }
    let stored: { wmKey: string; cleanKey: string };
    try {
      stored = await storeCardFrontImage(Buffer.from(await file.arrayBuffer()));
    } catch {
      throw new DomainError("이미지를 처리할 수 없습니다 — 다른 사진으로 시도해주세요");
    }
    const view: CardImageView = isAdmin(account)
      ? { kind: "admin" }
      : { kind: "public", publicBase: catalogPublicUrl("").replace(/\/$/, "") };
    return {
      r2Key: stored.wmKey,
      previewUrl: cardImageSrc({ frontR2Key: stored.wmKey }, view) as string,
    };
  });
}

// 관리자 — 신규 등록(즉시 공개). 이름은 "멤버 · 시리즈"로 자동 생성.
export async function createCardAdmin(
  input: CardInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parse(input);
    const [name, pose, analysis] = await Promise.all([
      buildCardName(data.memberId, data.seriesId),
      nextPose(data.memberId, data.seriesId),
      analysisFields(data.frontR2Key),
    ]);
    const row = await catalogDb.card.create({
      data: {
        status: "active",
        name,
        pose,
        itemType: data.itemType,
        teamId: BigInt(data.teamId),
        memberId: BigInt(data.memberId),
        seriesId: BigInt(data.seriesId),
        frontR2Key: data.frontR2Key,
        itemCode: data.itemCode || null,
        retailPriceJpy: data.retailPriceJpy ?? 0,
        ...analysis,
      },
    });
    revalidateCards();
    return { id: Number(row.id) };
  });
}

// 관리자 — 수정 (이미지 교체 포함, 이미지 없는 external 카드도 메타는 수정 가능).
const cardUpdateSchema = cardInputSchema.extend({
  frontR2Key: z.string().trim().min(1).nullable(),
});
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;

export async function updateCard(
  id: number,
  input: CardUpdateInput,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = cardUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
        "invalid_input",
      );
    }
    const data = parsed.data;
    // 멤버·시리즈가 바뀌면 이름을 재생성하고 포즈도 새 그룹의 다음 순번으로.
    const before = await catalogDb.card.findUnique({
      where: { id: BigInt(id) },
      select: { memberId: true, seriesId: true, pose: true },
    });
    if (!before) throw new DomainError("카드를 찾을 수 없어요", "not_found");
    const moved =
      Number(before.memberId ?? 0) !== data.memberId ||
      Number(before.seriesId ?? 0) !== data.seriesId;
    const [name, pose] = await Promise.all([
      buildCardName(data.memberId, data.seriesId),
      moved ? nextPose(data.memberId, data.seriesId) : before.pose,
    ]);
    await catalogDb.card.update({
      where: { id: BigInt(id) },
      data: {
        name,
        pose,
        itemType: data.itemType,
        teamId: BigInt(data.teamId),
        memberId: BigInt(data.memberId),
        seriesId: BigInt(data.seriesId),
        ...(data.frontR2Key ? { frontR2Key: data.frontR2Key } : {}),
        itemCode: data.itemCode || null,
        retailPriceJpy: data.retailPriceJpy ?? 0,
        updatedAt: new Date(),
      },
    });
    revalidateCards();
  });
}

export async function deleteCard(id: number): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    await catalogDb.card.delete({ where: { id: BigInt(id) } });
    revalidateCards();
  });
}

// 유저 — 새 토레카 제보(검수 대기로 등록, 관리자 승인 후 공개).
export async function submitCardReport(
  input: CardInput,
): Promise<ActionResult<{ id: number }>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const data = parse(input);
    // 과도 제보 방지 — 검수 대기 10건까지.
    const pending = await catalogDb.card.count({
      where: { submittedByAccountId: account.id, status: "pending" },
    });
    if (pending >= 10) {
      throw new DomainError(
        "검수 대기 중인 제보가 10건이에요 — 검수 후 다시 등록해주세요",
        "too_many_pending",
      );
    }
    // 유저 제보는 AI 분석 없이 접수한다 — 분석(임베딩 저장)은 관리자가 카탈로그에서
    // 승인해 우리 데이터로 확정하는 시점(reviewCard/approveCards)에 한다.
    const [name, pose] = await Promise.all([
      buildCardName(data.memberId, data.seriesId),
      nextPose(data.memberId, data.seriesId),
    ]);
    // 카탈로그 DB 는 dev·prd 공유 — 제보자 계정 id 는 이 환경의 커머스 DB 에만 있으므로 환경을 함께 적는다.
    const row = await catalogDb.card.create({
      data: {
        status: "pending",
        submittedByAccountId: account.id,
        submittedEnv: deployEnvName(),
        name,
        pose,
        itemType: data.itemType,
        teamId: BigInt(data.teamId),
        memberId: BigInt(data.memberId),
        seriesId: BigInt(data.seriesId),
        frontR2Key: data.frontR2Key,
      },
    });
    revalidateCards();
    return { id: Number(row.id) };
  });
}

// 제보 승인 보상 — 결제에 쓸 수 있는 일반 포인트로 적립.
const CARD_REPORT_POINTS = 100;

// 보상 대상인가 — 유저 제보이고, 제보가 들어온 환경이 지금 환경일 때만(계정 id 가 이 DB 에 있다).
// submitted_env 가 없는 예전 행은 같은 환경으로 본다.
function isRewardableHere(row: {
  submittedByAccountId: string | null;
  submittedEnv?: string | null;
}): boolean {
  return (
    row.submittedByAccountId !== null &&
    (row.submittedEnv ?? deployEnvName()) === deployEnvName()
  );
}

async function grantCardReportPoints(
  accountId: string,
  cardId: bigint,
): Promise<void> {
  await db.pointTransaction.create({
    data: {
      accountId,
      amount: CARD_REPORT_POINTS,
      reason: "card_report",
      memo: `토레카 제보 승인 적립 (card #${cardId})`,
    },
  });
}

// 관리자 — 제보 검수 (승인 → 공개 / 반려 → 사유 기록).
export async function reviewCard(
  id: number,
  decision: "approve" | "reject",
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    await requireAdmin();
    const row = await catalogDb.card.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new DomainError("카드를 찾을 수 없어요", "not_found");
    // 승인 = 우리 데이터로 저장하는 순간 → 이때 앞면을 AI 분석해 임베딩을 함께 저장한다.
    // (제보 접수 시점에는 분석하지 않았다.) 반려는 분석하지 않는다.
    const analysis =
      decision === "approve" && row.frontR2Key
        ? await analysisFields(row.frontR2Key)
        : {};
    await catalogDb.card.update({
      where: { id: BigInt(id) },
      data: {
        status: decision === "approve" ? "active" : "rejected",
        reviewNote: note?.trim() || null,
        updatedAt: new Date(),
        ...analysis,
      },
    });
    // 유저 제보가 처음 승인될 때만 100P 적립(대기 → 공개 전이 1회). 다른 환경의 제보는 여기서 적립하지 않는다.
    if (
      decision === "approve" &&
      row.status === "pending" &&
      isRewardableHere(row)
    ) {
      await grantCardReportPoints(row.submittedByAccountId!, row.id);
    }
    revalidateCards();
  });
}

// 유저 등록 화면 — 시리즈/멤버 선택 시 기존 카드 노출(중복 제보 방지).
export async function fetchExistingCards(
  seriesId: number | null,
  memberId: number | null,
): Promise<ActionResult<Card[]>> {
  return runAction(async () => listExistingCards(seriesId, memberId));
}

// 관리자 등록 화면 — 연속 등록 힌트(이 시리즈에 등록된 카드 N장 · 다음 포즈 #M).
const hintInputSchema = z.object({
  memberId: z.number().int().positive(),
  seriesId: z.number().int().positive(),
});

export async function fetchRegistrationHint(input: {
  memberId: number;
  seriesId: number;
}): Promise<ActionResult<RegistrationHint>> {
  return runAction(async () => {
    await requireAdmin();
    const parsed = hintInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError("입력값을 확인해주세요", "invalid_input");
    }
    return getRegistrationHint(parsed.data.memberId, parsed.data.seriesId);
  });
}

// AI 유사 카드 찾기 — 업로드한 앞면을 임베딩해 같은 그룹(+멤버)의 공개 카드와 코사인 비교.
// 토레카분석기의 "저장 전 비교" 단계 포팅. AWS 미설정이면 configured=false로 알려 UI가
// 안내 문구를 띄운다(에러 아님). 로그인만 요구 — 관리자 등록·유저 제보 화면 공용.
export type SimilarCardsResult = {
  configured: boolean;
  matches: SimilarCard[];
};

const similarInputSchema = z.object({
  frontR2Key: z.string().trim().min(1),
  teamId: z.number().int().positive().nullable(),
  memberId: z.number().int().positive().nullable(),
});

export async function findSimilarCards(input: {
  frontR2Key: string;
  teamId: number | null;
  memberId: number | null;
}): Promise<ActionResult<SimilarCardsResult>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const parsed = similarInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new DomainError("입력값을 확인해주세요", "invalid_input");
    }
    const data = parsed.data;
    const analysis = await analyzeCardFrontByKey(data.frontR2Key);
    if (!analysis) return { configured: false, matches: [] };
    const candidates = await listAnalyzedCandidates(data.teamId, data.memberId);
    const matches = rankSimilarCards(analysis.embedding, candidates, {
      k: SIMILAR_TOP_K,
      minScore: SIMILAR_MIN_SCORE,
    });
    return { configured: true, matches };
  });
}

// 카탈로그(관리) — 저장된 AI 분석값 열람. 임베딩은 클라이언트로 통째로 보내지 않고(1024 float)
// 요약 통계 + 앞부분 미리보기 + 저장된 임베딩으로 계산한 유사 카드만 돌려준다. Bedrock 호출 없음.
export type CardAnalysisDetail = {
  model: string | null;
  analyzedAt: string | null;
  dimension: number;
  /** L2 노름 — Titan 은 정규화 벡터라 ≈1.0 이어야 정상 */
  norm: number | null;
  stats: { min: number; max: number; mean: number } | null;
  /** 앞 64차원 — 스파크라인용 */
  preview: number[];
  similar: SimilarCard[];
};

const ANALYSIS_PREVIEW_DIMS = 64;

export async function getCardAnalysisDetail(
  cardId: number,
): Promise<ActionResult<CardAnalysisDetail>> {
  return runAction(async () => {
    await requireAdmin();
    const row = await catalogDb.card.findUnique({
      where: { id: BigInt(cardId) },
      select: {
        teamId: true,
        memberId: true,
        analysisEmbedding: true,
        analysisModel: true,
        analyzedAt: true,
      },
    });
    if (!row) throw new DomainError("카드를 찾을 수 없어요", "not_found");
    const embedding = Array.isArray(row.analysisEmbedding)
      ? (row.analysisEmbedding as unknown[]).map(Number)
      : null;
    if (!embedding || embedding.length === 0) {
      return {
        model: row.analysisModel,
        analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
        dimension: 0,
        norm: null,
        stats: null,
        preview: [],
        similar: [],
      };
    }
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sq = 0;
    for (const v of embedding) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sq += v * v;
    }
    const candidates = (
      await listAnalyzedCandidates(
        row.teamId === null ? null : Number(row.teamId),
        row.memberId === null ? null : Number(row.memberId),
      )
    ).filter((c) => c.id !== cardId);
    return {
      model: row.analysisModel,
      analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
      dimension: embedding.length,
      norm: Math.sqrt(sq),
      stats: { min, max, mean: sum / embedding.length },
      preview: embedding.slice(0, ANALYSIS_PREVIEW_DIMS),
      similar: rankSimilarCards(embedding, candidates, { k: SIMILAR_TOP_K, minScore: 0.3 }),
    };
  });
}

// 목록에 없는 시리즈를 등록 화면에서 바로 추가 — 분석기와 같은 흐름.
// 같은 그룹에 같은 이름이 있으면 그 시리즈를 그대로 쓴다(find-or-create).
export async function createSeriesInline(
  teamId: number,
  label: string,
  kind: string,
): Promise<ActionResult<{ id: number; label: string; kind: string }>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const cleanLabel = label.trim();
    const cleanKind = kind.trim() || "unknown";
    if (!cleanLabel) throw new DomainError("시리즈 이름을 입력해주세요");
    if (cleanLabel.length > 200) throw new DomainError("시리즈 이름이 너무 길어요");
    const existing = await catalogDb.series.findFirst({
      where: {
        teamId: BigInt(teamId),
        label: { equals: cleanLabel, mode: "insensitive" },
      },
    });
    if (existing) {
      return {
        id: Number(existing.id),
        label: existing.label,
        kind: existing.kind,
      };
    }
    // SKU는 내부 식별용 자동 발급 — 외부 동기화 SKU와 충돌하지 않게 접두어를 둔다.
    const sku = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const row = await catalogDb.series.create({
      data: { sku, teamId: BigInt(teamId), label: cleanLabel, kind: cleanKind },
    });
    revalidatePath("/catalog");
    revalidateCards();
    return { id: Number(row.id), label: row.label, kind: row.kind };
  });
}

// 검수 대기 카드 일괄 승인 — 관리자가 확인을 마친 카드들을 한 번에 공개.
export async function approveCards(
  ids: number[],
): Promise<ActionResult<{ approved: number }>> {
  return runAction(async () => {
    await requireAdmin();
    if (ids.length === 0) throw new DomainError("선택된 카드가 없어요");
    // 지급 대상(대기 중인 유저 제보)을 먼저 확보 — updateMany 후엔 전이를 알 수 없다.
    const rewardTargets = await catalogDb.card.findMany({
      where: {
        id: { in: ids.map((id) => BigInt(id)) },
        status: "pending",
        submittedByAccountId: { not: null },
      },
      select: { id: true, submittedByAccountId: true, submittedEnv: true },
    });
    // 승인 대상(대기 중)을 확보하고 카드별로 저장한다 — 승인 = 저장 시점이므로 각 앞면을
    // AI 분석해 임베딩을 함께 넣는다(updateMany는 행별 데이터를 못 넣어 개별 update).
    const targets = await catalogDb.card.findMany({
      where: { id: { in: ids.map((id) => BigInt(id)) }, status: "pending" },
      select: { id: true, frontR2Key: true },
    });
    const now = new Date();
    await Promise.all(
      targets.map(async (t) => {
        const analysis = t.frontR2Key ? await analysisFields(t.frontR2Key) : {};
        await catalogDb.card.update({
          where: { id: t.id },
          data: { status: "active", updatedAt: now, ...analysis },
        });
      }),
    );
    for (const target of rewardTargets) {
      if (!isRewardableHere(target)) continue;
      await grantCardReportPoints(target.submittedByAccountId!, target.id);
    }
    revalidateCards();
    return { approved: targets.length };
  });
}
