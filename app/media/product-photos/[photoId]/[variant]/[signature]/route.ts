import { customerProductImageResponse } from "@/modules/products/lib/customer-media-response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ photoId: string; variant: string; signature: string }>;
  },
) {
  const { photoId, variant, signature } = await params;
  return customerProductImageResponse(
    "photo",
    Number(photoId),
    variant,
    signature,
  );
}
