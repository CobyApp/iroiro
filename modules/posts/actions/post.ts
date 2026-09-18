"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionResult, parseActionInput, runAction } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { idSchema, postCreateSchema, postUpdateSchema } from "../lib/schema";
import { assertCanWrite } from "../lib/write-guard";
import * as m from "../lib/mutations";

async function requireAccount() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("post"));
  return account;
}
function revalidatePost(code?: string) {
  revalidatePath("/posts");
  revalidatePath("/posts/my");
  if (code) revalidatePath(`/posts/${code}`);
}

export async function createPost(
  input: unknown,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    const account = await requireAccount();
    assertCanWrite(account);
    const data = parseActionInput(postCreateSchema, input);
    const result = await m.createPost(account.id, data);
    revalidatePost(result.postPublicCode);
    return result;
  });
}

export async function updatePost(
  input: unknown,
): Promise<ActionResult<{ postPublicCode: string }>> {
  return runAction(async () => {
    const account = await requireAccount();
    const data = parseActionInput(postUpdateSchema, input);
    const result = await m.updatePost(account.id, data);
    revalidatePost(result.postPublicCode);
    return result;
  });
}

export async function deletePost(postId: number): Promise<ActionResult> {
  return runAction(async () => {
    const account = await requireAccount();
    const id = parseActionInput(idSchema, postId);
    const result = await m.deletePost(account.id, id);
    revalidatePost(result.postPublicCode);
  });
}
