import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductWithPhotos } from "../types";

type Props = {
  product: ProductWithPhotos;
};

export function ProductPhotoDownload({ product }: Props) {
  if (product.photos.length === 0) return null;

  const zipHref = `/delivery/products/${product.id}/photos/download-all`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>사진 다운로드</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild className="w-full">
          <a href={zipHref}>
            <Package className="mr-2 h-4 w-4" />
            전체 ZIP ({product.photos.length}장)
          </a>
        </Button>

        <ul className="divide-y rounded-sm border border-border">
          {product.photos.map((photo) => {
            const href = `/delivery/products/${product.id}/photos/${photo.id}/download`;
            const order = String(photo.displayOrder + 1).padStart(2, "0");
            const filename = photo.r2Key.split("/").pop() ?? photo.r2Key;
            return (
              <li
                key={photo.id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="w-6 shrink-0 text-muted-foreground">
                  {order}
                </span>
                {photo.isThumbnail && (
                  <span className="shrink-0 rounded-xs bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">
                    대표
                  </span>
                )}
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {filename}
                </span>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  aria-label="이 사진 다운로드"
                >
                  <a href={href}>
                    <Download className="h-3 w-3" />
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
