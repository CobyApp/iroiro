"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/modules/ui/components/BrandMark";

type Props = {
  src: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  style?: React.CSSProperties;
  loading?: "eager" | "lazy";
  decoding?: "async" | "auto" | "sync";
  onDoubleClick?: () => void;
};

export function ProductImage({
  src,
  alt,
  className,
  fallbackClassName,
  style,
  loading,
  decoding = "async",
  onDoubleClick,
}: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
          fallbackClassName,
        )}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
      </div>
    );
  }

  return (
    <>
      {/* 이미지 로딩 중엔 카드 자리에 이로이로 로고를 둔다. JS 없이 순수 CSS로 동작 —
          사진이 로드되면 위에 얹힌 불투명 <img>가 자연스럽게 이 자리를 덮는다.
          부모가 positioned(relative/absolute)여야 inset-0이 맞는다. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <BrandMark className="h-14 w-14 opacity-35" />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn("relative", className)}
        style={style}
        loading={loading}
        decoding={decoding}
        onError={() => setFailed(true)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
        draggable={false}
      />
    </>
  );
}
