import "server-only";

import { createRequire } from "node:module";
import { Readable } from "node:stream";
import type archiverType from "archiver";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import { fetchProductPhotoOriginal } from "@/modules/products/lib/photo-source";
import {
  buildContentDisposition,
  buildPhotoFilename,
  buildZipFilename,
} from "@/modules/products/lib/photo-filename";
import { getPhotosDownloadContext } from "@/modules/products/lib/queries";

// archiver는 CommonJS (`export = archiver`) 모듈이라 Turbopack의 ESM static
// analysis가 default를 잡지 못한다. createRequire로 CJS require 후 타입 cast.
const cjsRequire = createRequire(import.meta.url);
const archiver = cjsRequire("archiver") as typeof archiverType;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  await requireAdmin();
  const { id } = await params;

  const productId = Number.parseInt(id, 10);
  if (!Number.isInteger(productId) || productId <= 0) {
    return new NextResponse("Invalid product id", { status: 400 });
  }

  const context = await getPhotosDownloadContext(productId);
  if (!context) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (context.photos.length === 0) {
    return new NextResponse("사진이 없습니다", { status: 404 });
  }

  // 이미지는 이미 압축되어 있어 zlib level은 1로(저-CPU). archive 자체가
  // Transform stream — Response body로 그대로 패스스루.
  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.on("warning", (err) => {
    console.warn(`[zip-download] archiver warning:`, err);
  });
  archive.on("error", (err) => {
    console.error(`[zip-download] archiver error:`, err);
  });

  // fetch는 병렬·append는 순차. archiver 내부 entry 순서 보장을 위해.
  const fetched = await Promise.all(
    context.photos.map(async (photo) => {
      try {
        const obj = await fetchProductPhotoOriginal(photo.r2Key);
        const filename = buildPhotoFilename({
          productName: context.productName,
          memberName: context.memberName,
          displayOrder: photo.displayOrder,
          r2Key: photo.r2Key,
        });
        return { filename, body: obj.body };
      } catch (err) {
        console.warn(
          `[zip-download] skip photo ${photo.id} (${photo.r2Key}):`,
          err,
        );
        return null;
      }
    }),
  );

  for (const item of fetched) {
    if (!item) continue;
    const nodeStream = Readable.fromWeb(
      item.body as Parameters<typeof Readable.fromWeb>[0],
    );
    archive.append(nodeStream, { name: item.filename });
  }

  void archive.finalize();

  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": buildContentDisposition(
        buildZipFilename(context.productName),
      ),
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
