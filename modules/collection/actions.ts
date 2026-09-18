"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, DomainError, parseActionInput, runAction } from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import * as mutations from "./lib/mutations";
import {
  createCollectionSchema,
  deleteCollectionSchema,
  registerItemSchema,
  reorderItemsSchema,
  setCollectionPublicSchema,
  setCollectionTitleSchema,
  unregisterItemSchema,
  type CreateCollectionInput,
  type DeleteCollectionInput,
  type RegisterItemInput,
  type ReorderItemsInput,
  type SetCollectionPublicInput,
  type SetCollectionTitleInput,
  type UnregisterItemInput,
} from "./lib/schema";

async function requireAccountId(): Promise<string> {
  const account = await getCurrentAccount();
  // 회원 액션의 로그인 가드 — 세션 만료는 정상적 예상 상황이므로 사용자에게 안내 메시지를
  // 보여준다(DomainError). cart·orders와 동일 규약. (admin 전용 requireAdmin만 그대로 throw.)
  if (!account) throw new DomainError("로그인이 필요합니다");
  return account.id;
}

// 소유자 관리 페이지(/collections)와 공개 페이지를 함께 갱신.
function revalidateCollectionPaths(publicCode?: string): void {
  revalidatePath("/collections");
  if (publicCode) revalidatePath(`/collections/${publicCode}`);
}

export async function createCollection(
  input: CreateCollectionInput,
): Promise<ActionResult<{ publicCode: string }>> {
  return runAction(async () => {
    const { title } = parseActionInput(createCollectionSchema, input);
    const accountId = await requireAccountId();
    const created = await mutations.createCollection(accountId, title);
    revalidateCollectionPaths(created.publicCode);
    return { publicCode: created.publicCode };
  });
}

export async function deleteCollection(
  input: DeleteCollectionInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const { collectionId } = parseActionInput(deleteCollectionSchema, input);
    const accountId = await requireAccountId();
    await mutations.deleteCollection(accountId, collectionId);
    revalidateCollectionPaths();
  });
}

export async function registerItem(input: RegisterItemInput): Promise<ActionResult> {
  return runAction(async () => {
    const { collectionId, productId } = parseActionInput(registerItemSchema, input);
    const accountId = await requireAccountId();
    const { publicCode } = await mutations.registerItem(accountId, collectionId, productId);
    revalidateCollectionPaths(publicCode);
  });
}

export async function unregisterItem(input: UnregisterItemInput): Promise<ActionResult> {
  return runAction(async () => {
    const { collectionId, productId } = parseActionInput(unregisterItemSchema, input);
    const accountId = await requireAccountId();
    const { publicCode } = await mutations.unregisterItem(
      accountId,
      collectionId,
      productId,
    );
    revalidateCollectionPaths(publicCode);
  });
}

export async function reorderItems(input: ReorderItemsInput): Promise<ActionResult> {
  return runAction(async () => {
    const { collectionId, orderedProductIds } = parseActionInput(reorderItemsSchema, input);
    const accountId = await requireAccountId();
    const { publicCode } = await mutations.reorderItems(
      accountId,
      collectionId,
      orderedProductIds,
    );
    revalidateCollectionPaths(publicCode);
  });
}

export async function setCollectionPublic(
  input: SetCollectionPublicInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const { collectionId, isPublic } = parseActionInput(setCollectionPublicSchema, input);
    const accountId = await requireAccountId();
    const { publicCode } = await mutations.setCollectionPublic(
      accountId,
      collectionId,
      isPublic,
    );
    revalidateCollectionPaths(publicCode);
  });
}

export async function setCollectionTitle(
  input: SetCollectionTitleInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const { collectionId, title } = parseActionInput(setCollectionTitleSchema, input);
    const accountId = await requireAccountId();
    const { publicCode } = await mutations.setCollectionTitle(
      accountId,
      collectionId,
      title,
    );
    revalidateCollectionPaths(publicCode);
  });
}
