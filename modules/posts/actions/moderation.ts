"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, parseActionInput, runAction } from "@/lib/action-result";
import { requireBoardManager } from "@/modules/admin/lib/requireBoardManager";
import { dismissSchema, hideSchema, idSchema, unhideSchema } from "../lib/schema";
import * as m from "../lib/mutations";

// 숨김/해제는 대상 글의 공개 노출을 실제로 바꾼다 — 목록·상세·admin 큐 + 작성자 내 글
// (숨김 상태·사유가 바뀜) 모두 revalidate.
function revalidateModeration(code: string): void {
  revalidatePath("/posts");
  revalidatePath(`/posts/${code}`);
  revalidatePath("/posts/my");
  revalidatePath("/board/posts");
}

export async function hidePost(
  input: unknown,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const data = parseActionInput(hideSchema, input);
    const result = await m.hidePost(admin, data);
    revalidateModeration(result.postPublicCode);
    return result;
  });
}

// 공개 상세에서 관리자가 타인 글을 바로 삭제(소프트) — requireBoardManager.
export async function moderatorDeletePost(
  postId: number,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    await requireBoardManager();
    const id = parseActionInput(idSchema, postId);
    const result = await m.moderatorDeletePost(id);
    revalidateModeration(result.postPublicCode);
    return result;
  });
}

export async function unhidePost(
  input: unknown,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const { targetId } = parseActionInput(unhideSchema, input);
    const result = await m.unhidePost(admin, targetId);
    revalidateModeration(result.postPublicCode);
    return result;
  });
}

export async function hideComment(
  input: unknown,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const data = parseActionInput(hideSchema, input);
    const result = await m.hideComment(admin, data);
    revalidateModeration(result.postPublicCode);
    return result;
  });
}

export async function unhideComment(
  input: unknown,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const { targetId } = parseActionInput(unhideSchema, input);
    const result = await m.unhideComment(admin, targetId);
    revalidateModeration(result.postPublicCode);
    return result;
  });
}

// dismiss는 대상 콘텐츠를 바꾸지 않는다(§신고 resolve 의미론) — postPublicCode도 반환하지
// 않으므로 revalidate 대상은 신고 큐 자체뿐이다.
export async function dismissReport(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireBoardManager();
    const data = parseActionInput(dismissSchema, input);
    await m.dismissReport(admin, data);
    revalidatePath("/board/posts");
  });
}
