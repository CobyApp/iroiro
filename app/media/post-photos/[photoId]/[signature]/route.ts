import { postThumbnailResponse } from "@/modules/posts/lib/post-media-response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ photoId: string; signature: string }> },
) {
  const { photoId, signature } = await params;
  return postThumbnailResponse(Number(photoId), signature);
}
