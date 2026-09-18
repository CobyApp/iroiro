"use server";
import { redirect } from "next/navigation";
import { type ActionResult, parseActionInput, runAction } from "@/lib/action-result";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { evidenceSchema, presignPhotosSchema } from "../lib/schema";
import { type CreatedPendingPhoto, createPendingPhotos } from "../lib/pending-photo";
import { getReportEvidencePhotoUrl } from "../lib/queries";

// presign — 재인코딩된 최종 Blob의 type·size를 받는다(P1-1 순서: Blob 확정 후 호출).
export async function presignPostPhotos(input: unknown): Promise<ActionResult<CreatedPendingPhoto[]>> {
  return runAction(async () => {
    const account = await getCurrentAccount();
    if (!account) redirect(loginRequiredHref("post"));
    const data = parseActionInput(presignPhotosSchema, input);
    return createPendingPhotos(account.id, data.files);
  });
}

// admin 증거 signer(P1-4) — requireAdmin을 입력 파싱보다 먼저 실행한다.
// snapshot에 실제 포함된 사진 키만 서명(임의 r2Key 클라 입력 서명 금지) — 조회는 queries가 담당.
export async function signReportEvidencePhoto(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseActionInput(evidenceSchema, input);
    return { url: await getReportEvidencePhotoUrl(data.reportId, data.photoIndex) };
  });
}
