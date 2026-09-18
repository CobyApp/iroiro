"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// 가로 스크롤 래퍼 — 데스크탑(md+)에서 양쪽 화살표 버튼을 띄워
// 마우스로도 편하게 넘길 수 있게 한다. (드래그 스크롤·휠은 그대로)
// 끝에 닿은 방향의 화살표는 숨긴다. 터치 기기는 네이티브 스와이프 우선.
export function HScroll({
  children,
  className,
}: {
  children: ReactNode;
  /** 스크롤 컨테이너에 줄 클래스 — 기존 scroll-x 행 클래스를 그대로 넘긴다. */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    // 콘텐츠·창 크기 변화에도 화살표 상태 갱신.
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update]);

  function scrollBy(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const delta = direction * el.clientWidth * 0.8;
    const from = el.scrollLeft;
    el.scrollBy({ left: delta, behavior: "smooth" });
    // smooth 스크롤이 무시되는 환경(감속 모션·일부 임베디드 브라우저) 폴백.
    window.setTimeout(() => {
      if (Math.abs(el.scrollLeft - from) < 2) el.scrollLeft = from + delta;
    }, 150);
  }

  const arrowClass =
    "absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/95 text-foreground shadow-card backdrop-blur transition-opacity hover:bg-muted md:grid";

  return (
    <div className="relative">
      <div ref={ref} onScroll={update} className={className}>
        {children}
      </div>
      {canLeft && (
        <button
          type="button"
          aria-label="왼쪽으로 스크롤"
          onClick={() => scrollBy(-1)}
          className={cn(arrowClass, "left-1")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="오른쪽으로 스크롤"
          onClick={() => scrollBy(1)}
          className={cn(arrowClass, "right-1")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
