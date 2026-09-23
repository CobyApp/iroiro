"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { HScroll } from "@/components/HScroll";
import { ProductImage } from "@/modules/products/components/ProductImage";

// 중고 매물 사진 갤러리 — 유저가 올린 실물 사진을 큰 화면 + 썸네일로.
export function UsedPhotoGallery({
  photos,
  alt,
}: {
  photos: { id: number; url: string }[];
  alt: string;
}) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="mx-auto aspect-[3/4] w-full max-w-[360px] rounded-md border border-border bg-muted sm:max-w-[420px]" />
    );
  }
  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="mx-auto w-full max-w-[360px] space-y-3 sm:max-w-[420px]">
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border bg-muted shadow-card">
        <ProductImage
          src={current.url}
          alt={alt}
          className="h-full w-full object-cover"
          loading="eager"
        />
      </div>
      {photos.length > 1 && (
        <HScroll className="scroll-x flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "h-16 w-16 flex-shrink-0 overflow-hidden rounded-sm border transition-opacity",
                i === index
                  ? "border-primary"
                  : "border-border opacity-70 hover:opacity-100",
              )}
              aria-label={`사진 ${i + 1}`}
            >
              <ProductImage
                src={photo.url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </HScroll>
      )}
    </div>
  );
}
