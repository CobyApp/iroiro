const FILENAME_DANGER_RE = /[/\\:*?"<>|\x00-\x1F]/g;
const SEGMENT_CAP = 30;

function sanitizeSegment(input: string): string {
  return input
    .replace(FILENAME_DANGER_RE, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function capLength(input: string, max = SEGMENT_CAP): string {
  const chars = Array.from(input);
  return chars.length <= max ? input : chars.slice(0, max).join("");
}

function extractExt(r2Key: string, fallback = "bin"): string {
  const last = r2Key.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot < 0 || dot === last.length - 1) return fallback;
  const raw = last.slice(dot + 1).toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

export type PhotoFilenameInput = {
  productName: string;
  memberName: string | null;
  displayOrder: number;
  r2Key: string;
};

export function buildPhotoFilename(input: PhotoFilenameInput): string {
  const product = capLength(sanitizeSegment(input.productName));
  const member = input.memberName
    ? capLength(sanitizeSegment(input.memberName))
    : "";
  const order = String(input.displayOrder + 1).padStart(2, "0");
  const ext = extractExt(input.r2Key);

  const segments = [product, member, order].filter((s) => s.length > 0);
  return `${segments.join("_")}.${ext}`;
}

export function buildZipFilename(productName: string): string {
  const product = capLength(sanitizeSegment(productName));
  return `${product.length > 0 ? product : "product"}.zip`;
}

export function buildContentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
