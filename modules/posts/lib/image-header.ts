// 이미지 헤더 파싱 — 픽셀 상한 검증 수단이며 전체 이미지 디코딩과 동등하지 않다(§결정 8).
// fail-closed: 지원 형식이라도 치수를 확인할 수 없으면 null → 호출부가 거부한다.

export const JPEG_SOF_SCAN_LIMIT = 65_536; // SOF 탐색 상한 64KB — 초과 시 거부(스펙)

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";
export type ImageDimensions = { width: number; height: number };

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) =>
  ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const u32le = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const asciiAt = (b: Uint8Array, o: number, len: number) =>
  String.fromCharCode(...b.subarray(o, o + len));

export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function parseImageDimensions(
  bytes: Uint8Array,
  type: SniffedImageType,
): ImageDimensions | null {
  switch (type) {
    case "image/png":
      return parsePng(bytes);
    case "image/jpeg":
      return parseJpeg(bytes);
    case "image/webp":
      return parseWebp(bytes);
  }
}

// PNG — 시그니처 직후 첫 청크가 IHDR(길이 13)이어야 한다(구조 검증).
function parsePng(b: Uint8Array): ImageDimensions | null {
  if (b.length < 24) return null;
  if (u32be(b, 8) !== 13 || asciiAt(b, 12, 4) !== "IHDR") return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// JPEG — 마커 스트림에서 SOF(프레임 시작) 세그먼트를 찾아 치수를 읽는다.
// SOF = 0xC0~0xCF 중 DHT(0xC4)·JPG(0xC8)·DAC(0xCC) 제외. 탐색 상한 64KB(초과 시 null).
function parseJpeg(b: Uint8Array): ImageDimensions | null {
  const limit = Math.min(b.length, JPEG_SOF_SCAN_LIMIT);
  let offset = 2; // SOI(FFD8) 건너뜀
  while (offset + 3 < limit) {
    if (b[offset] !== 0xff) return null; // 마커 정렬 깨짐 — fail-closed
    let marker = b[offset + 1];
    while (marker === 0xff && offset + 2 < limit) {
      offset++;
      marker = b[offset + 1];
    } // fill 바이트
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2; // 길이 없는 마커
      continue;
    }
    if (offset + 4 > limit) return null;
    const segmentLength = u16be(b, offset + 2);
    if (segmentLength < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > b.length) return null;
      const height = u16be(b, offset + 5);
      const width = u16be(b, offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + segmentLength;
  }
  return null; // SOF 미발견(상한 초과 포함) — fail-closed
}

// WebP — RIFF 컨테이너의 첫 청크로 판정. VP8(손실)·VP8L(무손실)·VP8X(확장) 3형식 모두 지원(스펙).
// 최소 길이는 형식별로 다르다: VP8L payload는 5바이트(총 25바이트)라 공통 30바이트로 막으면
// 정상 VP8L을 오거부한다(P1-6 리뷰 반영).
const WEBP_PAYLOAD_OFFSET = 20; // RIFF 헤더 12 + 청크 헤더 8
function parseWebp(b: Uint8Array): ImageDimensions | null {
  if (b.length < WEBP_PAYLOAD_OFFSET + 5) return null; // 최소 payload = VP8L 5바이트
  const fourcc = asciiAt(b, 12, 4);
  const declaredPayload = u32le(b, 16);
  // 형식별 최소 payload 확인. 선언 길이가 최소치 미만이면 손상(fail-closed).
  // "선언 > 실제"는 헤더만 받는 range GET에서 정상이므로 실제 길이는 별도로 본다.
  const need = (payloadBytes: number) =>
    declaredPayload >= payloadBytes && b.length >= WEBP_PAYLOAD_OFFSET + payloadBytes;
  if (fourcc === "VP8 ") {
    // 프레임 태그 3B 후 시작 코드 9D 01 2A, 이어서 14bit width·height(LE). payload ≥ 10.
    if (!need(10)) return null;
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    const width = u16le(b, 26) & 0x3fff;
    const height = u16le(b, 28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (fourcc === "VP8L") {
    if (!need(5)) return null; // 0x2f + 32bit packed
    if (b[20] !== 0x2f) return null; // 시그니처
    const packed = u32le(b, 21);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >>> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (fourcc === "VP8X") {
    if (!need(10)) return null; // flags 1 + reserved 3 + canvas 3+3
    const width = u24le(b, 24) + 1;
    const height = u24le(b, 27) + 1;
    return { width, height };
  }
  return null; // 미지 청크 — fail-closed
}
