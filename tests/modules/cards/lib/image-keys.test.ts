import { describe, expect, it } from "vitest";
import {
  CARD_CLEAN_PREFIX,
  CARD_WM_PREFIX,
  cardCleanKey,
  cardImageKeysFor,
  isCardCleanKey,
} from "@/modules/cards/lib/image-keys";

const ID = "0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("card image keys — wm/clean 두 벌 규약", () => {
  it("한 id 로 wm·clean 키 쌍을 만든다", () => {
    expect(cardImageKeysFor(ID)).toEqual({
      wm: `${CARD_WM_PREFIX}${ID}.jpg`,
      clean: `${CARD_CLEAN_PREFIX}${ID}.jpg`,
    });
  });

  it("wm 키에서 clean 키를 파생하고, 규약 밖(예전 cards/original) 키는 null", () => {
    expect(cardCleanKey(`cards/wm/${ID}.jpg`)).toBe(`cards/clean/${ID}.jpg`);
    expect(cardCleanKey(`cards/original/${ID}.jpg`)).toBeNull();
    expect(cardCleanKey("products/original/x.jpg")).toBeNull();
  });

  it("clean 키 형식 검증 — 경로 조작·다른 프리픽스는 거른다", () => {
    expect(isCardCleanKey(`cards/clean/${ID}.jpg`)).toBe(true);
    expect(isCardCleanKey(`cards/wm/${ID}.jpg`)).toBe(false);
    expect(isCardCleanKey("cards/clean/../wm/x.jpg")).toBe(false);
    expect(isCardCleanKey("cards/clean/x.jpg")).toBe(false);
  });
});
