"use server";

import { revalidatePath } from "next/cache";
import { v7 as uuidv7 } from "uuid";

import { db } from "@/lib/db";
import { getSignedUploadUrl } from "@/lib/r2/presign";
import { relayUploadToR2 } from "@/lib/r2/relay";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import {
  bannerCreateSchema,
  bannerUpdateSchema,
  type BannerCreateInput,
  type BannerUpdateInput,
} from "./lib/schema";

// 관리자 배너 CRUD. 각 액션이 requireAdmin으로 자체 재검증한다 —
// Server Action은 액션 ID만 알면 공개 라우트로도 호출되므로 라우트 게이트에 위임할 수 없다.

const IMG_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function parseDate(v: string): Date | null {
  const t = v.trim();
  return t === "" ? null : new Date(t);
}

export async function presignBannerImage(input: {
  contentType: string;
}): Promise<{ uploadUrl: string; key: string }> {
  await requireAdmin();
  const ext = IMG_EXT[input.contentType];
  if (!ext) throw new Error("이미지 파일만 업로드할 수 있습니다.");
  const key = `banners/${uuidv7()}.${ext}`;
  const uploadUrl = await getSignedUploadUrl(key, input.contentType);
  return { uploadUrl, key };
}

// 서버 경유 업로드 — R2 버킷 CORS 미설정으로 브라우저 직접 PUT이 차단된다.
export async function uploadBannerImageFile(
  formData: FormData,
): Promise<{ key: string }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof Blob)) throw new Error("파일이 없습니다.");
  const ext = IMG_EXT[file.type];
  if (!ext) throw new Error("이미지 파일만 업로드할 수 있습니다.");
  const key = `banners/${uuidv7()}.${ext}`;
  await relayUploadToR2(file, key);
  return { key };
}

export async function createBanner(input: BannerCreateInput): Promise<void> {
  await requireAdmin();
  const d = bannerCreateSchema.parse(input);
  await db.banner.create({
    data: {
      title: d.title,
      imageKey: d.imageKey,
      linkUrl: d.linkUrl,
      startsAt: parseDate(d.startsAt),
      endsAt: parseDate(d.endsAt),
      sortOrder: d.sortOrder,
    },
  });
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function updateBanner(input: BannerUpdateInput): Promise<void> {
  await requireAdmin();
  const d = bannerUpdateSchema.parse(input);
  await db.banner.update({
    where: { id: BigInt(d.id) },
    data: {
      title: d.title,
      imageKey: d.imageKey,
      linkUrl: d.linkUrl,
      startsAt: parseDate(d.startsAt),
      endsAt: parseDate(d.endsAt),
      sortOrder: d.sortOrder,
      updatedAt: new Date(),
    },
  });
  revalidatePath("/admin/banners");
  revalidatePath("/");
}

export async function deleteBanner(id: number): Promise<void> {
  await requireAdmin();
  await db.banner.delete({ where: { id: BigInt(id) } });
  revalidatePath("/admin/banners");
  revalidatePath("/");
}
