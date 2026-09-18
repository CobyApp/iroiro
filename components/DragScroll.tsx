"use client";

import { useEffect } from "react";

// 데스크탑 마우스 드래그로 가로 스크롤 — 상품 행·필터 칩·표 등
// overflow-x 스크롤 영역 전부에 위임 방식으로 적용한다(휠·트랙패드는 그대로).
// 터치 기기는 네이티브 스크롤이 있으므로 mouse 이벤트만 다룬다.

const DRAG_THRESHOLD_PX = 5;

function findScrollableX(start: Element | null): HTMLElement | null {
  let el: Element | null = start;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      // 입력 요소 위에서는 드래그 스크롤을 시작하지 않는다(텍스트 선택·조작 보호).
      if (el.matches("input, textarea, select, [contenteditable='true']")) {
        return null;
      }
      if (el.scrollWidth > el.clientWidth + 1) {
        const { overflowX } = getComputedStyle(el);
        if (overflowX === "auto" || overflowX === "scroll") return el;
      }
    }
    el = el.parentElement;
  }
  return null;
}

export function DragScroll() {
  useEffect(() => {
    let target: HTMLElement | null = null;
    let startX = 0;
    let startScrollLeft = 0;
    let dragged = false;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      target = findScrollableX(e.target as Element);
      if (!target) return;
      startX = e.clientX;
      startScrollLeft = target.scrollLeft;
      dragged = false;
    }

    function onMouseMove(e: MouseEvent) {
      if (!target) return;
      const dx = e.clientX - startX;
      if (!dragged && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragged = true;
      target.scrollLeft = startScrollLeft - dx;
      // 드래그 중 텍스트 선택 방지.
      e.preventDefault();
    }

    function onMouseUp() {
      if (!target) return;
      const wasDragged = dragged;
      target = null;
      if (wasDragged) {
        // 드래그로 끝난 마우스업 직후의 click 한 번을 삼켜
        // 카드 링크가 눌린 것으로 처리되지 않게 한다.
        const swallow = (clickEvent: MouseEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
        };
        document.addEventListener("click", swallow, {
          capture: true,
          once: true,
        });
        // 클릭 이벤트가 없는 경우(영역 밖 마우스업) 다음 틱에 해제.
        setTimeout(() => {
          document.removeEventListener("click", swallow, { capture: true });
        }, 0);
      }
      dragged = false;
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return null;
}
