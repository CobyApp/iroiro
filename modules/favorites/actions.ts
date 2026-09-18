"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ActionResult,
  DomainError,
  parseActionInput,
  runAction,
} from "@/lib/action-result";
import { getCurrentAccount } from "@/modules/auth/dal";
import { replaceFavorites } from "./lib/queries";

const idList = z.array(z.number().int().positive()).max(50);
const saveFavoritesSchema = z.object({
  teamIds: idList,
  memberIds: idList,
});

/** 최애 그룹·멤버 저장(전량 교체) — 회원정보 화면에서 사용. */
export async function saveFavorites(input: {
  teamIds: number[];
  memberIds: number[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const data = parseActionInput(saveFavoritesSchema, input);
    const account = await getCurrentAccount();
    if (!account) throw new DomainError("로그인이 필요합니다");
    await replaceFavorites(account.id, data);
    revalidatePath("/");
    revalidatePath("/mypage/edit");
  });
}
