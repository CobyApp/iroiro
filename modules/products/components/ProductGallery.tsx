"use client";

import { useState } from "react";
import { RotateCw, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductImage } from "./ProductImage";
import { CardViewer3D, type Viewer3DCard } from "@/components/CardViewer3D";
export type CustomerProductPhoto = {
  id: number;
  altText: string | null;
  url: string;
};

type Props = {
  photos: CustomerProductPhoto[];
  altFallback: string;
};

// 포토카드 앞/뒤 3D 플립 히어로 + 라이트박스.
// 앞면=photos[0], 뒷면=photos[1](있으면). 나머지 사진은 썸네일→라이트박스로 열람.
export function ProductGallery({ photos, altFallback }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [viewer, setViewer] = useState<Viewer3DCard | null>(null);

  if (photos.length === 0) {
    return (
      <div className="mx-auto aspect-[3/4] w-full max-w-[360px] rounded-md border border-border bg-muted shadow-card sm:max-w-[420px]" />
    );
  }

  const front = photos[0];
  const back = photos.length > 1 ? photos[1] : null;
  const src = (photo: CustomerProductPhoto) => photo.url;

  return (
    <>
      <div className="mx-auto w-full max-w-[360px] space-y-3 sm:max-w-[420px]">
        <div className="relative aspect-[3/4] [perspective:1200px]">
          {/* 플립 이너 */}
          <div
            className={cn(
              "relative h-full w-full [transform-style:preserve-3d] transition-transform duration-500 ease-[cubic-bezier(.2,.7,.3,1.35)]",
              flipped && "[transform:rotateY(180deg)]",
            )}
          >
            {/* 앞면 */}
            <div className="absolute inset-0 overflow-hidden rounded-md border border-border bg-muted shadow-card [backface-visibility:hidden]">
              <Badge className="absolute left-3 top-3 z-10">앞면</Badge>
              <ProductImage
                src={src(front)}
                alt={front.altText ?? altFallback}
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
            {/* 뒷면 */}
            {back && (
              <div className="absolute inset-0 overflow-hidden rounded-md border border-border bg-muted shadow-card [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <Badge
                  variant="secondary"
                  className="absolute left-3 top-3 z-10"
                >
                  뒷면
                </Badge>
                <ProductImage
                  src={src(back)}
                  alt={back.altText ?? `${altFallback} 뒷면`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
          </div>

          {/* 줌 버튼 */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setViewer({
                front: src(front),
                back: back ? src(back) : null,
                title: altFallback,
              })
            }
            className="absolute right-3 top-3 z-20 h-8 gap-1 bg-card/95 px-2.5 text-xs shadow-card"
            aria-label="3D 카드 확대 보기"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            3D 보기
          </Button>

          {/* 플립 버튼 (뒷면 있을 때만) */}
          {back && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFlipped((v) => !v)}
              className="absolute bottom-3 left-1/2 z-20 h-8 -translate-x-1/2 gap-1.5 px-3 text-xs shadow-card"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {flipped ? "앞면 보기" : "뒤집어 보기"}
            </Button>
          )}
        </div>
      </div>

      <CardViewer3D card={viewer} onClose={() => setViewer(null)} />
    </>
  );
}
