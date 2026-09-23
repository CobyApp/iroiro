"use client";

import { useState } from "react";
import { ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HScroll } from "@/components/HScroll";
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

// 상품 사진 히어로 + 3D 확대. 토레카는 앞면만 다루므로 뒤집기는 없다 —
// 사진이 여러 장이면 아래 썸네일로 히어로를 바꾸고, 확대 버튼은 현재 사진을 3D 뷰어로 연다.
export function ProductGallery({ photos, altFallback }: Props) {
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<Viewer3DCard | null>(null);

  if (photos.length === 0) {
    return (
      <div className="mx-auto aspect-[3/4] w-full max-w-[360px] rounded-md border border-border bg-muted shadow-card sm:max-w-[420px]" />
    );
  }

  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <>
      <div className="mx-auto w-full max-w-[360px] space-y-3 sm:max-w-[420px]">
        <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-muted shadow-card">
          <ProductImage
            src={current.url}
            alt={current.altText ?? altFallback}
            className="h-full w-full object-cover"
            loading="eager"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setViewer({ front: current.url, title: altFallback })}
            className="absolute right-3 top-3 z-20 h-8 gap-1 bg-card/95 px-2.5 text-xs shadow-card"
            aria-label="카드 확대 보기"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            확대
          </Button>
        </div>

        {photos.length > 1 && (
          <HScroll className="scroll-x flex gap-2 overflow-x-auto pb-1">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}번 사진 보기`}
                aria-pressed={i === index}
                className={cn(
                  "aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-sm border transition-colors",
                  i === index ? "border-primary" : "border-border hover:border-primary/50",
                )}
              >
                <ProductImage
                  src={photo.url}
                  alt={photo.altText ?? `${altFallback} ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </HScroll>
        )}
      </div>

      <CardViewer3D card={viewer} onClose={() => setViewer(null)} />
    </>
  );
}
