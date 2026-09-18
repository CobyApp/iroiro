"use client";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Counter from "yet-another-react-lightbox/plugins/counter";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/counter.css";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductPhoto } from "../types";

type Props = {
  photos: ProductPhoto[];
  publicBaseUrl: string;
  altFallback: string;
  initialIndex: number;
  onClose: () => void;
  /**
   * 사진 src 도출을 호출자가 직접 제어 (예: 업로드 폼의 blob preview URL).
   * 미지정 시 `${publicBaseUrl}/${photo.r2Key}` 폴백.
   */
  getSrc?: (photo: ProductPhoto, index: number) => string;
};

/**
 * yet-another-react-lightbox 기반 풀스크린 사진 뷰어.
 *
 * Zoom plugin이 컨테이너 안에서의 bounded zoom + drag pan + 핀치 줌 + 휠 줌
 * 모두 처리한다. Counter plugin이 좌상단 "1 / N" 표시를 담당.
 *
 * 키보드: ←/→ 사진 이동, +/- 또는 휠 줌, 더블클릭 줌 토글, Esc 닫기.
 */
export function ProductLightbox({
  photos,
  publicBaseUrl,
  altFallback,
  initialIndex,
  onClose,
  getSrc,
}: Props) {
  const slides = photos.map((photo, index) => ({
    src: getSrc ? getSrc(photo, index) : `${publicBaseUrl}/${photo.r2Key}`,
    alt: photo.altText ?? altFallback,
  }));

  return (
    <Lightbox
      open
      close={onClose}
      slides={slides}
      index={initialIndex}
      plugins={[Zoom, Counter]}
      zoom={{
        maxZoomPixelRatio: 4,
        zoomInMultiplier: 1.5,
        doubleTapDelay: 300,
        doubleClickDelay: 300,
        scrollToZoom: true,
      }}
      labels={{
        Previous: "이전",
        Next: "다음",
        Close: "닫기",
        "Zoom in": "확대",
        "Zoom out": "축소",
      }}
      counter={{
        container: {
          // yet-another-react-lightbox/plugins/counter.css 가 우리 Tailwind 유틸과
          // 같은 specificity로 늦게 로드돼 padding/border-radius/color를 덮어쓴다.
          // 형태·색을 명확히 보이게 하려면 `!`로 라이브러리 기본을 누른다.
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
