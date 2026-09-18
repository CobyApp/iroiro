"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Banner } from "@/modules/banners/types";

// 홈 상단 캠페인 배너 — 관리자가 이미지/링크를 여러 개 등록하면 자동 슬라이드한다.
export function BannerSlider({
  banners,
  publicBase,
}: {
  banners: Banner[];
  publicBase: string;
}) {
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(
      () => setIndex((prev) => (prev + 1) % count),
      4000,
    );
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  function move(offset: number) {
    setIndex((current) => (current + offset + count) % count);
  }

  return (
    <section
      className="kawaii-banner-slider"
      aria-label="이벤트 및 추천 배너"
      aria-roledescription="carousel"
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {banners.map((b) => (
          <a
            key={b.id}
            href={b.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- R2 배너 이미지 */}
            <img
              src={`${publicBase}/${b.imageKey}`}
              alt={b.title}
              className="aspect-[16/8] w-full object-cover sm:aspect-[16/6]"
            />
          </a>
        ))}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="이전 배너"
            onClick={() => move(-1)}
            className="kawaii-banner-control left-3"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            onClick={() => move(1)}
            className="kawaii-banner-control right-3"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-white/80 px-2 py-1 backdrop-blur-sm">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`${i + 1}번 배너로`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-200",
                  i === index ? "w-4 bg-primary" : "w-1.5 bg-ink/25",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
