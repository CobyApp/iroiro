"use client";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/captions.css";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CardSlide = {
  src: string;
  title: string;
  /** 멤버 · 시리즈 · 포즈 등 보조 설명 */
  description?: string;
};

// 카탈로그 카드 풀스크린 뷰어 — 고객 상품 갤러리(ProductLightbox)와 같은 엔진.
// 휠·핀치·더블클릭 확대, ←/→ 이동, 캡션에 카드 이름·계층을 보여준다.
export function CardLightbox({
  slides,
  index,
  onClose,
}: {
  slides: CardSlide[];
  index: number;
  onClose: () => void;
}) {
  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides.map((s) => ({
        src: s.src,
        alt: s.title,
        title: s.title,
        description: s.description,
      }))}
      plugins={[Zoom, Counter, Captions]}
      zoom={{
        maxZoomPixelRatio: 5,
        zoomInMultiplier: 1.6,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
        scrollToZoom: true,
      }}
      captions={{ descriptionTextAlign: "center", showToggle: true }}
      labels={{
        Previous: "이전",
        Next: "다음",
        Close: "닫기",
        "Zoom in": "확대",
        "Zoom out": "축소",
      }}
      counter={{
        container: {
          className: cn(
            badgeVariants({ variant: "overlay" }),
            "left-4! top-4! rounded-md! bg-primary! px-3! py-2! text-sm! text-primary-foreground!",
          ),
        },
      }}
      carousel={{ finite: true }}
    />
  );
}
