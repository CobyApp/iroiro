"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { type ActionResult, DomainError, parseActionInput, runAction } from "@/lib/action-result";
import { db } from "@/lib/db";
import { PHOTO_ALLOWED_TYPES, UNSUPPORTED_TYPE_MESSAGE } from "@/lib/photo-client";
import { isUniqueViolationOn } from "@/lib/prisma-errors";
import { generatePublicCode } from "@/lib/public-code";
import { buildNoticeR2Key, getSignedUploadUrl } from "@/lib/r2/presign";
import { relayUploadToR2 } from "@/lib/r2/relay";
import { requireBoardManager } from "@/modules/admin/lib/requireBoardManager";
import {
  NOTICE_PHOTO_MAX_COUNT,
  NOTICE_PHOTO_MAX_FILE_BYTES,
  NOTICE_PIN_LIMIT,
  noticeCreateSchema,
  noticeUpdateSchema,
  type NoticeCreateInput,
  type NoticeUpdateInput,
} from "./lib/schema";
import { toNotice } from "./lib/transform";
import type { Notice } from "./types";

const MAX_CODE_RETRY = 3;

// 고정 0건이면 잠글 행이 없어 FOR UPDATE로는 상한을 보장할 수 없음(팬텀 문제) →
// advisory xact lock으로 고정 mutation 전체를 직렬화한다. tx 종료 시 자동 해제.
// (스펙 §데이터 모델 — notice)
async function assertPinCapacity(
  tx: Prisma.TransactionClient,
  excludeId?: bigint,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('notice_pin'))`;
  const pinned = await tx.notice.count({
    where: {
      isPinned: true,
      deletedAt: null,
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });
  if (pinned >= NOTICE_PIN_LIMIT) {
    throw new DomainError(`상단 고정은 최대 ${NOTICE_PIN_LIMIT}개까지 가능합니다`);
  }
}

function revalidateNoticePaths(publicCode?: string): void {
  revalidatePath("/");
  revalidatePath("/notices");
  revalidatePath("/board/notices");
  if (publicCode) revalidatePath(`/notices/${publicCode}`);
}

export async function createNotice(
  input: NoticeCreateInput,
): Promise<ActionResult<Notice>> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const data = parseActionInput(noticeCreateSchema, input);

    // code 충돌(P2002) 재시도는 트랜잭션 *바깥*에서 — 명시적 tx 안의 에러는 tx 전체를 abort한다.
    // 시도마다 새 tx를 열고, 고정 상한 검증(advisory lock)도 그 tx 안에서 함께 수행한다
    // (lock은 tx 종료 시 해제되므로 시도마다 재획득 — 정상).
    for (let attempt = 0; ; attempt++) {
      try {
        const row = await db.$transaction(async (tx) => {
          if (data.isPinned) await assertPinCapacity(tx);
          const created = await tx.notice.create({
            data: {
              publicCode: generatePublicCode(),
              category: data.category,
              title: data.title,
              body: data.body,
              isPinned: data.isPinned,
              createdBy: admin.id,
              updatedBy: admin.id,
            },
          });
          if (data.photos.length > 0) {
            await tx.noticePhoto.createMany({
              data: data.photos.map((r2Key, index) => ({
                noticeId: created.id,
                r2Key,
                displayOrder: index,
              })),
            });
          }
          return created;
        });
        revalidateNoticePaths(row.publicCode);
        return toNotice(row, data.photos.map((r2Key) => ({ r2Key })));
      } catch (error) {
        if (
          isUniqueViolationOn(error, "public_code") &&
          attempt < MAX_CODE_RETRY - 1
        ) {
          continue;
        }
        throw error;
      }
    }
  });
}

export async function updateNotice(
  input: NoticeUpdateInput,
): Promise<ActionResult<Notice>> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const data = parseActionInput(noticeUpdateSchema, input);
    const id = BigInt(data.id);

    const row = await db.$transaction(async (tx) => {
      if (data.isPinned) await assertPinCapacity(tx, id);

      // 원자적 조건부 UPDATE — 존재 확인과 쓰기를 분리하면 그 사이 동시 삭제가 끼어들어
      // 삭제된 행을 덮어쓰는 TOCTOU가 생긴다. soft delete 필터를 쓰기 조건에 포함한다.
      const updated = await tx.notice.updateMany({
        where: { id, deletedAt: null },
        data: {
          category: data.category,
          title: data.title,
          body: data.body,
          isPinned: data.isPinned,
          updatedAt: new Date(),
          updatedBy: admin.id,
        },
      });
      if (updated.count === 0) throw new DomainError("공지를 찾을 수 없습니다");

      // 사진 전체 교체 — 유지분은 r2Key 재제출(스펙 결정 6). 행 불변 패턴이라 UPDATE 없음.
      await tx.noticePhoto.deleteMany({ where: { noticeId: id } });
      if (data.photos.length > 0) {
        await tx.noticePhoto.createMany({
          data: data.photos.map((r2Key, index) => ({
            noticeId: id,
            r2Key,
            displayOrder: index,
          })),
        });
      }

      return tx.notice.findFirstOrThrow({ where: { id } });
    });

    revalidateNoticePaths(row.publicCode);
    return toNotice(row, data.photos.map((r2Key) => ({ r2Key })));
  });
}

export async function deleteNotice(id: number): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    if (!Number.isInteger(id) || id <= 0) {
      throw new DomainError("유효하지 않은 공지 ID 입니다");
    }

    // soft delete — 공지는 대외 공유 문서라 게시 사실을 보존한다 (스펙 §데이터 모델)
    const result = await db.notice.updateMany({
      where: { id: BigInt(id), deletedAt: null },
      data: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: admin.id },
    });
    if (result.count === 0) throw new DomainError("공지를 찾을 수 없습니다");

    revalidateNoticePaths();
  });
}

// 첨부 즉시 업로드용 presign — 상품 presignProductPhotos 동형(admin 신뢰 전제).
// 서명 범위: getSignedUploadUrl은 allHeaders 없이 서명해 Content-Type·Content-Length 어느 것도
// 고정하지 않는다(aws4fetch가 둘 다 UNSIGNABLE_HEADERS로 제외 → SignedHeaders=host).
// 그래서 아래 MIME·크기 검사는 presign 시점의 자기신고 값 검증이며, 업로드된 객체에는 강제되지
// 않는다. 이 전제는 requireAdmin으로 admin만 이 경로에 도달한다는 데서만 성립한다
// (스펙 §보안 — 의도된 미검증). 대조: UGC(lib/r2/ugc.ts)는 allHeaders:true로 실제로 고정한다.
export async function presignNoticePhotos(
  files: { filename: string; mimeType: string; sizeBytes: number }[],
): Promise<ActionResult<{ r2Key: string; uploadUrl: string }[]>> {
  return runAction(async () => {
    await requireBoardManager();
    if (files.length === 0) throw new DomainError("파일이 없습니다");
    if (files.length > NOTICE_PHOTO_MAX_COUNT) {
      throw new DomainError(`사진은 최대 ${NOTICE_PHOTO_MAX_COUNT}장까지 첨부할 수 있습니다`);
    }
    for (const file of files) {
      if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.mimeType)) {
        throw new DomainError(UNSUPPORTED_TYPE_MESSAGE);
      }
      if (file.sizeBytes > NOTICE_PHOTO_MAX_FILE_BYTES) {
        throw new DomainError(`파일 크기 초과 (5MB 이하): ${file.filename}`);
      }
    }
    return Promise.all(
      files.map(async (file) => {
        const r2Key = buildNoticeR2Key(file.filename);
        const uploadUrl = await getSignedUploadUrl(r2Key, file.mimeType);
        return { r2Key, uploadUrl };
      }),
    );
  });
}

// 서버 경유 업로드 — R2 버킷 CORS 미설정으로 브라우저 직접 PUT이 차단된다.
export async function uploadNoticePhotoFile(
  formData: FormData,
): Promise<ActionResult<{ r2Key: string }>> {
  return runAction(async () => {
    await requireBoardManager();
    const file = formData.get("file");
    const filename = String(formData.get("filename") ?? "photo.jpg");
    if (!(file instanceof Blob)) throw new DomainError("파일이 없습니다");
    if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      throw new DomainError(UNSUPPORTED_TYPE_MESSAGE);
    }
    if (file.size > NOTICE_PHOTO_MAX_FILE_BYTES) {
      throw new DomainError(`파일 크기 초과 (5MB 이하): ${filename}`);
    }
    const r2Key = buildNoticeR2Key(filename);
    await relayUploadToR2(file, r2Key);
    return { r2Key };
  });
}
