"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, parseActionInput, runAction } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { reportCreateSchema } from "../lib/schema";
import * as m from "../lib/mutations";

async function requireAccount() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("post"));
  return account;
}

// 신고 자체는 대상 글/댓글의 공개 노출을 바꾸지 않는다(mutation이 postPublicCode를
// 반환하지 않는 이유와 동일) — 유일하게 달라지는 화면은 admin 신고 큐뿐이라 그것만 revalidate한다.
function revalidateReportQueue(): void {
  revalidatePath("/admin/posts/posts");
}

export async function reportPost(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireAccount();
    const data = parseActionInput(reportCreateSchema, input);
    await m.createPostReport(account.id, data);
    revalidateReportQueue();
  });
}

export async function reportComment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireAccount();
    const data = parseActionInput(reportCreateSchema, input);
    await m.createCommentReport(account.id, data);
    revalidateReportQueue();
  });
}
