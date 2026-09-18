import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { fetchR2Object } from "@/lib/r2/get";
import { requireAdmin } from "@/modules/admin/lib/requireAdmin";
import {
  buildContentDisposition,
  buildPhotoFilename,
} from "@/modules/products/lib/photo-filename";
import { getPhotoDownloadContext } from "@/modules/products/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string; photoId: string }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  await requireAdmin();
  const { id, photoId } = await params;

  const productId = Number.parseInt(id, 10);
  const photoIdNum = Number.parseInt(photoId, 10);
  if (!Number.isInteger(productId) || productId <= 0) {
    return new NextResponse("Invalid product id", { status: 400 });
  }
  if (!Number.isInteger(photoIdNum) || photoIdNum <= 0) {
    return new NextResponse("Invalid photo id", { status: 400 });
  }

  const context = await getPhotoDownloadContext(productId, photoIdNum);
  if (!context) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filename = buildPhotoFilename({
    productName: context.productName,
    memberName: context.memberName,
    displayOrder: context.photo.displayOrder,
    r2Key: context.photo.r2Key,
  });

  const r2Object = await fetchR2Object(context.photo.r2Key);

  const headers = new Headers({
    "Content-Type": r2Object.contentType,
    "Content-Disposition": buildContentDisposition(filename),
    "Cache-Control": "private, max-age=0, no-store",
  });
  if (r2Object.contentLength !== null) {
    headers.set("Content-Length", String(r2Object.contentLength));
  }

  return new Response(r2Object.body, { status: 200, headers });
}
