import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { watermarkOverlaySvg } from "@/lib/image/watermark";

describe("watermarkOverlaySvg", () => {
  it("지정 크기의 SVG를 만들고 워드마크를 data URI로 임베드한다", async () => {
    const svg = (await watermarkOverlaySvg(720, 1006)).toString("utf8");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="720"');
    expect(svg).toContain('height="1006"');
    // 브랜드 워드마크가 base64 PNG data URI로 들어간다
    expect(svg).toContain("data:image/png;base64,");
    // 타일이 여러 개 반복 배치된다
    expect((svg.match(/<use /g) ?? []).length).toBeGreaterThan(1);
  });

  it("sharp로 지정 크기 래스터에 합성 가능한 유효 SVG다", async () => {
    const overlay = await watermarkOverlaySvg(400, 560);
    const base = sharp({
      create: { width: 400, height: 560, channels: 3, background: "#ffffff" },
    });
    const out = await base
      .composite([{ input: overlay, blend: "over" }])
      .png()
      .toBuffer();
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([400, 560]);
  });
});
