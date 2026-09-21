"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  DomainError,
  runAction,
  type ActionResult,
} from "@/lib/action-result";
import { buildR2Key, getPublicUrl, getSignedUploadUrl } from "@/lib/r2/presign";
import { getCurrentAccount } from "@/modules/auth/dal";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { listAnalyzedCandidates, listExistingCards } from "./lib/queries";
import { normalizeCardImageBuffer } from "./lib/normalize-card-server";
import {
  analyzeCardFrontByKey,
  rankSimilarCards,
  type SimilarCard,
} from "./lib/analysis";
import type { Card } from "./types";

// 유사 카드 매칭 파라미터 — 노이즈를 줄이는 최소 유사도와 표시 개수.
const SIMILAR_MIN_SCORE = 0.5;
const SIMILAR_TOP_K = 6;

// 앞면 R2 키를 분석해 Prisma create/update에 넣을 분석 필드로 변환한다.
// AWS 미설정·분석 실패면 빈 객체 — 등록은 분석 없이 진행(fail-soft).
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

const PRESIGN_TTL_SECONDS = 3600;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
// 서버가 저장 직전에 63:88·720px·JPEG q82로 정규화하므로 입력 포맷은 sharp가 여는 것이면 된다
// (HEIC은 리눅스 sharp 기본 빌드에 디코더가 없어 제외). 클라이언트는 사전 축소만 담당한다.
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

const cardInputSchema = z.object({
  itemType: z.string().trim().min(1).max(50).default("photocard"),
  teamId: z.number().int().positive({ message: "그룹을 선택해주세요" }),
  memberId: z.number().int().positive({ message: "멤버를 선택해주세요" }),
  seriesId: z.number().int().positive({ message: "시리즈를 선택해주세요" }),
  frontR2Key: z.string().trim().min(1, "앞면 이미지를 올려주세요"),
  backR2Key: z.string().trim().min(1).nullable(),
  itemCode: z.string().trim().max(120).optional(),
  retailPriceJpy: z.number().int().min(0).optional(),
});

// 포즈 번호 자동 부여 — 같은 (시리즈, 멤버)의 다음 순번.
async function nextPose(memberId: number, seriesId: number): Promise<number> {
  const agg = await db.card.aggregate({
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
    db.member.findUnique({
      where: { id: BigInt(memberId) },
      select: { name: true },
    }),
    db.series.findUnique({
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
  revalidatePath("/admin/cards");
  revalidatePath("/cards/new");
}

// 앞/뒷면 이미지 업로드 — 서버 경유. 저장 직전에 서버가 Card(oshikore-card)와 동일한 규격으로
// 정규화한다(EXIF 보정 → 63:88 중앙 크롭 → 720×1006 → JPEG q82 progressive). 클라이언트의
// 사전 정규화는 전송량을 줄이는 보조 단계이며, 저장되는 객체의 규격은 여기서 보장된다.
export async function uploadCardPhoto(
  formData: FormData,
): Promise<ActionResult<{ r2Key: string; previewUrl: string }>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다", "login_required");
    const file = formData.get("file");
    const side = formData.get("side") === "back" ? "back" : "front";
    if (!(file instanceof Blob)) throw new DomainError("파일이 없습니다");
    if (!ALLOWED_MIME.includes(file.type)) {
      throw new DomainError(`지원하지 않는 포맷: ${file.type}`);
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new DomainError("파일 크기 초과 (8MB 이하)");
    }
    let normalized: Buffer;
    try {
      normalized = await normalizeCardImageBuffer(
        Buffer.from(await file.arrayBuffer()),
      );
    } catch {
      throw new DomainError("이미지를 처리할 수 없습니다 — 다른 사진으로 시도해주세요");
    }
    const r2Key = buildR2Key(`${side}.jpg`).replace(
      "products/original/",
      "cards/original/",
    );
    const uploadUrl = await getSignedUploadUrl(
      r2Key,
      "image/jpeg",
      PRESIGN_TTL_SECONDS,
    );
    const put = await fetch(uploadUrl, {
      method: "PUT",
      body: new Uint8Array(normalized),
      headers: { "Content-Type": "image/jpeg" },
    });
    if (!put.ok) throw new DomainError("이미지 업로드에 실패했습니다");
    return { r2Key, previewUrl: getPublicUrl(r2Key) };
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
    const row = await db.card.create({
      data: {
        source: "admin",
        status: "active",
        name,
        pose,
        itemType: data.itemType,
        teamId: BigInt(data.teamId),
        memberId: BigInt(data.memberId),
        seriesId: BigInt(data.seriesId),
        frontR2Key: data.frontR2Key,
        backR2Key: data.backR2Key,
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
    const before = await db.card.findUnique({
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
    await db.card.update({
      where: { id: BigInt(id) },
      data: {
        name,
        pose,
        itemType: data.itemType,
        teamId: BigInt(data.teamId),
        memberId: BigInt(data.memberId),
        seriesId: BigInt(data.seriesId),
        ...(data.frontR2Key ? { frontR2Key: data.frontR2Key } : {}),
        ...(data.backR2Key ? { backR2Key: data.backR2Key } : {}),
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
    await db.card.delete({ where: { id: BigInt(id) } });
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
    const pending = await db.card.count({
      where: { submittedByAccountId: account.id, status: "pending" },
    });
    if (pending >= 10) {
      throw new DomainError(
        "검수 대기 중인 제보가 10건이에요 — 검수 후 다시 등록해주세요",
        "too_many_pending",
      );
    }
    const [name, pose, analysis] = await Promise.all([
      buildCardName(data.memberId, data.seriesId),
      nextPose(data.memberId, data.seriesId),
      analysisFields(data.frontR2Key),
    ]);
    const row = await db.card.create({
      data: {
        source: "user",
        status: "pending",
        submittedByAccountId: account.id,
        name,
        pose,
        itemType: data.itemType,
        teamId: BigInt(data.teamId),
        memberId: BigInt(data.memberId),
        seriesId: BigInt(data.seriesId),
        frontR2Key: data.frontR2Key,
        backR2Key: data.backR2Key,
        ...analysis,
      },
    });
    revalidateCards();
    return { id: Number(row.id) };
  });
}

// 제보 승인 보상 — 결제에 쓸 수 있는 일반 포인트로 적립.
const CARD_REPORT_POINTS = 100;

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
    const row = await db.card.findUnique({ where: { id: BigInt(id) } });
    if (!row) throw new DomainError("카드를 찾을 수 없어요", "not_found");
    await db.card.update({
      where: { id: BigInt(id) },
      data: {
        status: decision === "approve" ? "active" : "rejected",
        reviewNote: note?.trim() || null,
        updatedAt: new Date(),
      },
    });
    // 유저 제보가 처음 승인될 때만 100P 적립(대기 → 공개 전이 1회).
    if (
      decision === "approve" &&
      row.status === "pending" &&
      row.source === "user" &&
      row.submittedByAccountId
    ) {
      await grantCardReportPoints(row.submittedByAccountId, row.id);
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
    const existing = await db.series.findFirst({
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
    const row = await db.series.create({
      data: { sku, teamId: BigInt(teamId), label: cleanLabel, kind: cleanKind },
    });
    revalidatePath("/admin/catalog");
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
    const rewardTargets = await db.card.findMany({
      where: {
        id: { in: ids.map((id) => BigInt(id)) },
        status: "pending",
        source: "user",
        submittedByAccountId: { not: null },
      },
      select: { id: true, submittedByAccountId: true },
    });
    const result = await db.card.updateMany({
      where: { id: { in: ids.map((id) => BigInt(id)) }, status: "pending" },
      data: { status: "active", updatedAt: new Date() },
    });
    for (const target of rewardTargets) {
      await grantCardReportPoints(target.submittedByAccountId!, target.id);
    }
    revalidateCards();
    return { approved: result.count };
  });
}
