import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  CARD_ASPECT,
  CARD_TARGET_WIDTH,
  normalizeCardImageVariants,
} from "@/modules/cards/lib/normalize-card-server";

const EXPECTED_HEIGHT = Math.round(CARD_TARGET_WIDTH / CARD_ASPECT); // 1006

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: "#b45a8c", noise: { type: "gaussian", mean: 128, sigma: 20 } },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe("normalizeCardImageVariants — 카드 clean·wm 두 벌", () => {
  it("두 벌 모두 63:88·720×1006 규격이다", async () => {
    const { clean, wm } = await normalizeCardImageVariants(await jpeg(2400, 1800));
    const [c, w] = await Promise.all([sharp(clean).metadata(), sharp(wm).metadata()]);
    expect([c.width, c.height]).toEqual([CARD_TARGET_WIDTH, EXPECTED_HEIGHT]);
    expect([w.width, w.height]).toEqual([CARD_TARGET_WIDTH, EXPECTED_HEIGHT]);
  });

  it("wm 에만 워터마크가 들어가 clean 과 다르다", async () => {
    const { clean, wm } = await normalizeCardImageVariants(await jpeg(1400, 2000));
    const [c, w] = await Promise.all([
      sharp(clean).raw().toBuffer(),
      sharp(wm).raw().toBuffer(),
    ]);
    expect(c.equals(w)).toBe(false);
  });
});
