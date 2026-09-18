"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// 상단 중앙 토스트 — 다이얼로그와 같은 표면·라운드·안전영역 기준을 사용한다.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      closeButton
      duration={3600}
      gap={8}
      offset={{ top: "max(1rem, env(safe-area-inset-top))" }}
      mobileOffset={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      toastOptions={{
        classNames: {
          toast:
            "!w-[min(calc(100vw-2rem),26rem)] !items-start !gap-3 !rounded-[1.25rem] !border !border-border/90 !bg-card !px-4 !py-3 !text-foreground !shadow-elevated !font-sans",
          title: "!font-medium !leading-snug !text-foreground",
          description: "!leading-relaxed !text-muted-foreground",
          icon: "!text-primary",
          closeButton:
            "!border-border !bg-card !text-muted-foreground hover:!bg-muted hover:!text-foreground",
          actionButton:
            "!h-8 !rounded-full !border !border-primary !bg-primary !px-3 !text-xs !font-medium !text-primary-foreground",
          cancelButton:
            "!h-8 !rounded-full !border !border-border !bg-card !px-3 !text-xs !font-medium !text-foreground",
          // 불투명 파스텔 — 배경 비침 없이 상태만 부드럽게 구분한다.
          success: "!bg-[#effcff] !text-ink !border-border",
          error: "!bg-[#fff0f5] !text-destructive !border-border",
          info: "!bg-card !text-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
