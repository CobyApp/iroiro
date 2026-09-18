"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// 내부 링크를 누른 순간부터 다음 라우트가 그려질 때까지 시각적 피드백을 준다.
// Next Link의 이동 자체는 건드리지 않고 document 상태와 진행 바만 관리한다.
export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <NavigationFeedbackState key={`${pathname}?${searchParams.toString()}`} />
  );
}

function NavigationFeedbackState() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    document.body.toggleAttribute("data-route-pending", pending);
    return () => document.body.removeAttribute("data-route-pending");
  }, [pending]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (
        nextUrl.origin !== currentUrl.origin ||
        (nextUrl.pathname === currentUrl.pathname &&
          nextUrl.search === currentUrl.search)
      ) {
        return;
      }

      setPending(true);
      document.body.setAttribute("data-route-pending", "true");
    };

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.body.removeAttribute("data-route-pending");
    };
  }, []);

  if (!pending) return null;

  return (
    <div className="route-progress" role="progressbar" aria-label="페이지 이동 중">
      <span />
    </div>
  );
}
