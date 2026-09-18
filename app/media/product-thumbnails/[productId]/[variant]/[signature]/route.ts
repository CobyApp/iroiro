import { customerProductImageResponse } from "@/modules/products/lib/customer-media-response";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ productId: string; variant: string; signature: string }>;
  },
) {
  const { productId, variant, signature } = await params;
  return customerProductImageResponse(
    "thumbnail",
    Number(productId),
    variant,
    signature,
  );
}
