import { describe, expect, it } from "vitest";
import {
  JPEG_SOF_SCAN_LIMIT,
  parseImageDimensions,
  sniffImageType,
} from "@/modules/posts/lib/image-header";

// ---- 픽스처 빌더 ----
function bytes(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p instanceof Uint8Array ? p : new Uint8Array(p), offset);
    offset += p.length;
  }
  return out;
}
const u16be = (v: number) => [v >> 8, v & 0xff];
const u32be = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const u16le = (v: number) => [v & 0xff, v >> 8];
const u24le = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff];
const u32le = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// PNG: 시그니처(8) + IHDR 청크(len 13 + "IHDR" + width + height + …5바이트)
function pngFixture(width: number, height: number, chunkType = "IHDR"): Uint8Array {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32be(13),
    ascii(chunkType),
    u32be(width),
    u32be(height),
    [8, 6, 0, 0, 0],
  );
}

// JPEG: SOI + (선행 세그먼트들) + SOF 마커 + [len, precision, height, width, …]
function jpegFixture(
  width: number,
  height: number,
  sofMarker = 0xc0,
  prefixSegments: Uint8Array = new Uint8Array(0),
): Uint8Array {
  return bytes(
    [0xff, 0xd8],
    prefixSegments,
    [0xff, sofMarker],
    u16be(11),
    [8],
    u16be(height),
    u16be(width),
    [3, 0x11, 0x22],
  );
}
// 임의 길이의 APP1 필러 세그먼트(마커 포함 총 2 + 2 + dataLen 바이트)
function appSegment(dataLen: number): Uint8Array {
  return bytes([0xff, 0xe1], u16be(dataLen + 2), new Uint8Array(dataLen));
}

const riff = (fourcc: string, payload: Uint8Array) =>
  bytes(
    ascii("RIFF"),
    u32le(4 + 8 + payload.length),
    ascii("WEBP"),
    ascii(fourcc),
    u32le(payload.length),
    payload,
  );

// WebP VP8(손실): 프레임 태그 3B + 시작 코드 9D 01 2A + width(14bit LE) + height(14bit LE)
function webpVp8(width: number, height: number): Uint8Array {
  return riff("VP8 ", bytes([0, 0, 0], [0x9d, 0x01, 0x2a], u16le(width), u16le(height)));
}
// WebP VP8L(무손실): 0x2F + 32bit LE(14bit width-1, 14bit height-1)
function webpVp8l(width: number, height: number): Uint8Array {
  const packed = (width - 1) | ((height - 1) << 14);
  return riff("VP8L", bytes([0x2f], u32le(packed)));
}
// WebP VP8X(확장): flags(1) + reserved(3) + canvas width-1(24LE) + height-1(24LE)
function webpVp8x(width: number, height: number): Uint8Array {
  return riff("VP8X", bytes([0x10, 0, 0, 0], u24le(width - 1), u24le(height - 1)));
}

describe("sniffImageType", () => {
  it("JPEG·PNG·WebP 매직바이트를 식별한다", () => {
    expect(sniffImageType(jpegFixture(10, 10))).toBe("image/jpeg");
    expect(sniffImageType(pngFixture(10, 10))).toBe("image/png");
    expect(sniffImageType(webpVp8(10, 10))).toBe("image/webp");
  });
  it("그 외(SVG/HTML/짧은 바이트)는 null", () => {
    expect(sniffImageType(new Uint8Array(ascii("<svg xmlns=")))).toBeNull();
    expect(sniffImageType(new Uint8Array([0xff]))).toBeNull();
    // RIFF지만 WEBP가 아니면(WAV) null
    expect(sniffImageType(bytes(ascii("RIFF"), u32le(4), ascii("WAVE")))).toBeNull();
  });
});

describe("parseImageDimensions — PNG", () => {
  it("IHDR에서 width·height", () => {
    expect(parseImageDimensions(pngFixture(800, 600), "image/png")).toEqual({
      width: 800,
      height: 600,
    });
  });
  it("IHDR 아닌 첫 청크는 null(구조 검증)", () => {
    expect(parseImageDimensions(pngFixture(800, 600, "IDAT"), "image/png")).toBeNull();
  });
});

describe("parseImageDimensions — JPEG", () => {
  it("SOF0(baseline)·SOF2(progressive)에서 치수", () => {
    expect(parseImageDimensions(jpegFixture(1024, 768, 0xc0), "image/jpeg")).toEqual({
      width: 1024,
      height: 768,
    });
    expect(parseImageDimensions(jpegFixture(320, 240, 0xc2), "image/jpeg")).toEqual({
      width: 320,
      height: 240,
    });
  });
  it("DHT(0xC4)는 SOF로 오인하지 않는다", () => {
    // DHT 세그먼트 뒤에 SOF0 — DHT를 건너뛰고 SOF0에서 읽어야 한다.
    const dht = bytes([0xff, 0xc4], u16be(4), [0, 0]);
    expect(parseImageDimensions(jpegFixture(64, 32, 0xc0, dht), "image/jpeg")).toEqual({
      width: 64,
      height: 32,
    });
  });
  it("SOF가 64KB 탐색 상한 밖이면 null(fail-closed)", () => {
    // 필러 APP1 세그먼트로 SOF를 65536 바이트 밖으로 밀어낸다.
    const filler = bytes(appSegment(60_000), appSegment(10_000));
    expect(parseImageDimensions(jpegFixture(10, 10, 0xc0, filler), "image/jpeg")).toBeNull();
  });
  it("잘린 바이트는 null", () => {
    expect(parseImageDimensions(jpegFixture(10, 10).slice(0, 6), "image/jpeg")).toBeNull();
  });
});

describe("parseImageDimensions — WebP 3형식(§결정 8)", () => {
  it("VP8 / VP8L / VP8X 모두 치수 파싱", () => {
    expect(parseImageDimensions(webpVp8(640, 480), "image/webp")).toEqual({
      width: 640,
      height: 480,
    });
    expect(parseImageDimensions(webpVp8l(333, 222), "image/webp")).toEqual({
      width: 333,
      height: 222,
    });
    expect(parseImageDimensions(webpVp8x(9000, 100), "image/webp")).toEqual({
      width: 9000,
      height: 100,
    });
  });
  it("VP8 시작 코드 불일치·미지 청크는 null", () => {
    const bad = riff("VP8 ", bytes([0, 0, 0], [0x00, 0x01, 0x2a], u16le(10), u16le(10)));
    expect(parseImageDimensions(bad, "image/webp")).toBeNull();
    expect(parseImageDimensions(riff("ANMF", new Uint8Array(10)), "image/webp")).toBeNull();
  });
  it("형식별 최소 길이 — 정상 VP8L은 25바이트로 통과, 잘린 청크는 null(P1-6)", () => {
    expect(webpVp8l(333, 222).length).toBe(25); // 공통 30바이트 가드였다면 오거부
    expect(parseImageDimensions(webpVp8l(333, 222).slice(0, 23), "image/webp")).toBeNull();
    expect(parseImageDimensions(webpVp8(640, 480).slice(0, 28), "image/webp")).toBeNull();
  });
});

it("JPEG_SOF_SCAN_LIMIT은 64KB", () => {
  expect(JPEG_SOF_SCAN_LIMIT).toBe(65_536);
});
