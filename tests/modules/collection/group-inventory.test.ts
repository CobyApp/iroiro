import { describe, expect, it } from "vitest";
import { groupOwnedCards } from "@/modules/collection/lib/group-inventory";
import type { InventoryEntry } from "@/modules/collection/types";

function entry(over: Partial<InventoryEntry>): InventoryEntry {
  return {
    productId: 1,
    productName: "카드",
    productThumbnailKey: null,
    itemType: "photocard",
    teamId: 1,
    memberId: 1,
    quantity: 1,
    acquiredAt: "2026-07-22T00:00:00Z",
    ...over,
  };
}

const teamNames = { 1: "CUTIE STREET", 2: "다른 그룹" };
const memberNames = { 10: "리사", 11: "아이카", 20: "누군가" };

describe("groupOwnedCards", () => {
  it("팀→멤버별로 분류하고 수량을 합산한다", () => {
    const groups = groupOwnedCards(
      [
        entry({ productId: 1, teamId: 1, memberId: 10, quantity: 2 }),
        entry({ productId: 2, teamId: 1, memberId: 11, quantity: 1 }),
        entry({ productId: 3, teamId: 1, memberId: 10, quantity: 3 }),
        entry({ productId: 4, teamId: 2, memberId: 20, quantity: 1 }),
      ],
      teamNames,
      memberNames,
    );

    expect(groups).toHaveLength(2);
    const cutie = groups[0];
    expect(cutie.teamName).toBe("CUTIE STREET");
    expect(cutie.cardCount).toBe(6);
    expect(cutie.members).toHaveLength(2);
    const lisa = cutie.members.find((m) => m.memberId === 10)!;
    expect(lisa.memberName).toBe("리사");
    expect(lisa.cardCount).toBe(5);
    expect(lisa.entries).toHaveLength(2);
  });

  it("팀·멤버 이름이 없으면 '기타'로 폴백", () => {
    const groups = groupOwnedCards(
      [entry({ teamId: null, memberId: null })],
      {},
      {},
    );
    expect(groups[0].teamName).toBe("기타 그룹");
    expect(groups[0].members[0].memberName).toBe("기타 멤버");
  });
});
