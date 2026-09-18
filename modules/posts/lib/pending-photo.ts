import "server-only";
import { Prisma } from "@prisma/client";
import { v7 as uuidv7 } from "uuid";
import { DomainError } from "@/lib/action-result";
import { db as defaultDb } from "@/lib/db";
import {
  R2ConditionFailedError,
  UGC_PUT_TTL_SECONDS,
  copyUgcObject,
  deleteUgcObject,
  getUgcObjectRange,
  headUgcObject,
  presignUgcPut,
} from "@/lib/r2/ugc";
import { JPEG_SOF_SCAN_LIMIT, parseImageDimensions, sniffImageType } from "./image-header";
import { assertWithinRateLimit } from "./rate-limit";
import {
  PHOTO_MAX_DIMENSION,
  PHOTO_MAX_TOTAL_BYTES,
  PHOTO_RETRY_CODE,
  RATE_LIMITS,
} from "./schema";

type Db = typeof defaultDb;

export const PHOTO_UPLOAD_RETRY_MESSAGE = "사진 업로드를 다시 진행해주세요";
// 코드는 client-safe한 schema에 정의돼 있다(폼이 이 코드로 첨부를 비운다 — P2-3).
const retryError = () => new DomainError(PHOTO_UPLOAD_RETRY_MESSAGE, PHOTO_RETRY_CODE);

// 파이프라인 견고성 수치(P2-2 확정) — 사진 10장 = 30회+ 외부 요청.
const PIPELINE_CONCURRENCY = 3; // bounded concurrency(무제한 병렬 금지)
const PIPELINE_BUDGET_MS = 60_000; // 검증·복사 전체 상한
const COMPENSATION_BUDGET_MS = 15_000; // 보상·정리 전용 별도 상한(P1-3)

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function buildTmpKey(contentType: string): string {
  return `posts/tmp/${uuidv7()}.${EXT_BY_TYPE[contentType] ?? "bin"}`;
}
// 최종 키 = 임시 키에서 tmp/ prefix 제거(uuid 유지 — 추적 가능·재서명 불필요).
// 최종 키는 presign이 발급된 적 없어 클라이언트 쓰기가 원천 불가(§결정 8).
export function finalKeyOf(tmpKey: string): string {
  return tmpKey.replace(/^posts\/tmp\//, "posts/");
}

export type CreatedPendingPhoto = { pendingPhotoId: number; r2Key: string; uploadUrl: string };

// presign + 대기 사진 기록 — rate limit은 "생성되는 대기 사진 수" 기준 배치 검사(§9, P1-3).
export async function createPendingPhotos(
  accountId: string,
  files: { contentType: string; sizeBytes: number }[],
  db: Db = defaultDb,
): Promise<CreatedPendingPhoto[]> {
  await assertWithinRateLimit(
    RATE_LIMITS.presign,
    (since) => db.pendingPostPhoto.count({ where: { accountId, createdAt: { gte: since } } }),
    files.length,
  );
  const expiresAt = new Date(Date.now() + UGC_PUT_TTL_SECONDS * 1000);
  return Promise.all(
    files.map(async (file) => {
      const r2Key = buildTmpKey(file.contentType);
      const pending = await db.pendingPostPhoto.create({
        data: {
          accountId,
          r2Key,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          expiresAt,
        },
        select: { id: true },
      });
      const uploadUrl = await presignUgcPut(r2Key, file.contentType, file.sizeBytes);
      return { pendingPhotoId: Number(pending.id), r2Key, uploadUrl };
    }),
  );
}

export type ConsumedPendingPhoto = {
  id: bigint;
  r2Key: string;
  contentType: string;
  sizeBytes: number;
};

// 원자 소비 — 소유권·미소비·미만료를 하나의 조건부 UPDATE로(§결정 8). 갱신 행 수가 요청과
// 다르면 throw → 짧은 tx 전체 롤백(P1-7 전체 롤백 계약). 같은 대기 사진 동시 제출도 직렬화.
export async function consumePendingPhotos(
  accountId: string,
  pendingPhotoIds: number[],
  db: Db = defaultDb,
): Promise<ConsumedPendingPhoto[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: bigint; r2_key: string; content_type: string; size_bytes: number }[]
    >`
      UPDATE pending_post_photo
      SET consumed_at = now(), updated_at = now()
      WHERE id IN (${Prisma.join(pendingPhotoIds.map(BigInt))})
        AND account_id = ${accountId}::uuid
        AND consumed_at IS NULL
        AND expires_at > now()
      RETURNING id, r2_key, content_type, size_bytes`;
    if (rows.length !== pendingPhotoIds.length) throw retryError();
    // 글당 합계 상한은 여기서만 강제된다 — presign 스키마의 합계 검사는 "한 번의 요청" 안에서만
    // 성립하므로, 배치를 나눠 발급받은 대기 사진을 한 글에 모으면 우회된다.
    // tx 안에서 던져야 조건부 UPDATE가 통째로 롤백돼 대기 사진이 미소비로 남는다.
    const totalBytes = rows.reduce((sum, r) => sum + r.size_bytes, 0);
    if (totalBytes > PHOTO_MAX_TOTAL_BYTES) {
      throw new DomainError("사진 합계는 30MB 이하여야 합니다");
    }
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    return pendingPhotoIds.map((pendingPhotoId) => {
      const row = byId.get(pendingPhotoId)!;
      return {
        id: row.id,
        r2Key: row.r2_key,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
      };
    });
  });
}

// 실측 검증(ETag 고정) → 조건부 복사. 실패 시 임시 객체 즉시 삭제(미등록 상태 — 증거 이슈 없음).
// signal = 파이프라인 전체 예산 — 모든 R2 호출에 전달해 진행 중 요청도 함께 중단시킨다(P1-3).
// cleanupSignal = 실패 경로 정리 전용 예산 — 예산 소진 후에도 정리는 시도하되, 무제한으로 늘어지지
// 않게 상한을 건다(예산 없이 두면 요청 10초 × 3회가 사진마다 더해져 전체 응답이 100초를 넘길 수 있다).
async function validateAndCopy(
  pending: ConsumedPendingPhoto,
  signal: AbortSignal,
  cleanupSignal: () => AbortSignal,
): Promise<string> {
  const head = await headUgcObject(pending.r2Key, { signal });
  if (!head) throw retryError(); // 미업로드
  // 복사를 시도한 최종 키. 복사 응답이 유실돼도 보상 대상에 포함시키기 위해 try 밖에서 잡는다.
  let attemptedFinalKey: string | null = null;
  try {
    // ① 선언값 대조 — presign 서명값(Content-Length·Type)과 실측이 다르면 거부.
    if (head.contentType !== pending.contentType || head.contentLength !== pending.sizeBytes) {
      throw retryError();
    }
    // ② 매직바이트 + ③ 픽셀 헤더(fail-closed) — range GET은 If-Match(ETag 고정).
    const bytes = await getUgcObjectRange(pending.r2Key, head.etag, 0, JPEG_SOF_SCAN_LIMIT - 1, {
      signal,
    });
    const sniffed = sniffImageType(bytes);
    if (sniffed !== pending.contentType) throw retryError();
    const dims = parseImageDimensions(bytes, sniffed);
    if (!dims || dims.width > PHOTO_MAX_DIMENSION || dims.height > PHOTO_MAX_DIMENSION) {
      throw retryError();
    }
    // ④ 조건부 복사(임시→최종) — Copy 412는 "검증 후 교체" 시도 → 거부.
    // 복사를 "시도했다"는 사실을 먼저 기록한다: R2가 객체를 만든 뒤 응답만 유실되면 예외가 나도
    // 최종 객체는 존재한다. 반환값에만 의존하면 그 객체가 보상 대상에서 통째로 빠지고,
    // posts/에는 lifecycle이 없어 영구 고아가 된다.
    attemptedFinalKey = finalKeyOf(pending.r2Key);
    await copyUgcObject(pending.r2Key, attemptedFinalKey, head.etag, pending.contentType, { signal });
    return attemptedFinalKey;
  } catch (error) {
    // 두 삭제는 같은 cleanup 예산을 공유한다 — 예산이 소진된 뒤에도 정리 기회를 주되 총 시간을
    // 묶는다. 순서가 곧 우선순위다: 임시 객체를 먼저 지우면 그 지연이 예산을 다 먹었을 때
    // 최종 객체 삭제가 이미 abort된 signal로 호출돼 요청조차 나가지 못한다.
    // 임시 객체는 posts/tmp/ lifecycle이 fallback으로 걷어가지만 posts/에는 lifecycle이 없으므로,
    // 최종 객체를 먼저 지운다.
    // 복사가 실제로 성공했는데 응답만 유실된 경우를 덮는다 — 없으면 404라 멱등하게 통과한다.
    if (attemptedFinalKey !== null) {
      const deleted = await deleteUgcObject(attemptedFinalKey, { signal: cleanupSignal() });
      if (!deleted) {
        console.error("[photo-orphan] 복사 실패 후 최종 객체 정리 실패 — 정리 잡 대상:", attemptedFinalKey);
      }
    }
    await deleteUgcObject(pending.r2Key, { signal: cleanupSignal() });
    if (error instanceof R2ConditionFailedError) throw retryError();
    throw error;
  }
}

// bounded concurrency 실행기 — 첫 실패 또는 예산 소진 시 신규 디스패치 중단, 진행 중 항목은
// settle 대기(진행 중 요청 자체는 signal이 중단시킨다).
async function mapBounded<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  let failure: unknown = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === null && signal?.aborted !== true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await fn(items[index], index);
      } catch (error) {
        failure = failure ?? error;
      }
    }
  });
  await Promise.all(workers);
  if (failure !== null) throw failure;
  signal?.throwIfAborted(); // 실패 없이 예산만 소진된 경우
}

// 다중 사진 확정 — 부분 실패 시 누적 최종 객체 전체 보상 삭제(P1-7). 소비된 대기 사진은
// 복구하지 않는다(새 업로드 요구 — UX 계약).
// budget·cleanupBudget은 테스트 주입 seam이다 — `AbortSignal.timeout`은 Node 내부 타이머라
// fake timer로 제어되지 않으므로, 테스트는 자체 AbortController를 넘겨 소진을 결정적으로 재현한다.
export async function finalizePendingPhotos(
  pendings: ConsumedPendingPhoto[],
  options: { budget?: AbortSignal; cleanupBudget?: AbortSignal } = {},
): Promise<string[]> {
  // 전체 예산은 signal로 강제한다(P1-3) — 디스패치 직전 검사만으로는 이미 시작된 요청의
  // 재시도가 예산을 넘길 수 있다. 이 signal이 모든 R2 호출의 timeout과 결합된다.
  const budget = options.budget ?? AbortSignal.timeout(PIPELINE_BUDGET_MS);
  // 정리 예산은 "첫 실패 시점"부터 센다 — 파이프라인 시작 시각에 걸면 예산 소진 후에는 이미
  // 만료돼 정리 기회가 사라진다.
  let cleanup: AbortSignal | undefined = options.cleanupBudget;
  const cleanupSignal = () => (cleanup ??= AbortSignal.timeout(COMPENSATION_BUDGET_MS));

  const finalKeys: (string | undefined)[] = new Array(pendings.length);
  try {
    await mapBounded(
      pendings,
      PIPELINE_CONCURRENCY,
      async (pending, index) => {
        finalKeys[index] = await validateAndCopy(pending, budget, cleanupSignal);
      },
      budget,
    );
    return finalKeys as string[];
  } catch (error) {
    await compensateFinalObjects(
      finalKeys.filter((k): k is string => k !== undefined),
      cleanupSignal(),
    );
    // 예산 초과(AbortError 등)는 사용자에겐 재업로드 안내로 환원한다.
    if (budget.aborted && !(error instanceof DomainError)) throw retryError();
    throw error;
  }
}

// 보상 삭제 — 실패 키는 구조화 로그(버킷↔DB anti-join 정리 잡의 수거 대상, §후속).
// 검증·복사와 별도 예산·동시성 상한을 쓴다(P1-3) — 원 파이프라인 예산이 소진된 뒤 실행되기 때문.
export async function compensateFinalObjects(
  keys: string[],
  cleanupBudget?: AbortSignal,
): Promise<void> {
  if (keys.length === 0) return;
  const budget = cleanupBudget ?? AbortSignal.timeout(COMPENSATION_BUDGET_MS);
  await mapBounded(keys, PIPELINE_CONCURRENCY, async (key) => {
    let deleted = false;
    try {
      deleted = await deleteUgcObject(key, { signal: budget });
    } catch {
      deleted = false;
    }
    if (!deleted) console.error("[photo-orphan] 보상 삭제 실패 — 정리 잡 대상:", key);
  }).catch(() => {
    // 보상 단계의 예산 소진이 원래 실패 원인을 덮지 않게 흡수한다(로그는 위에서 남겼다).
  });
}

// DB 커밋 성공 후 임시 객체 정리(best-effort) — 실패는 posts/tmp/ lifecycle이 fallback.
// 절대 throw하지 않는다: 커밋된 글의 최종 객체를 보상 삭제하는 경로로 새어 나가면 안 된다(P2-1).
export async function cleanupTmpObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const budget = AbortSignal.timeout(COMPENSATION_BUDGET_MS);
  await mapBounded(keys, PIPELINE_CONCURRENCY, async (key) => {
    try {
      await deleteUgcObject(key, { signal: budget });
    } catch {
      // lifecycle fallback
    }
  }).catch(() => {});
}
