"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { LoginPromptDialog } from "@/modules/auth/components/LoginPromptDialog";
import { toggleUsedWishlist } from "../actions";

// 중고 매물 찜 토글 — 스토어 WishlistButton과 동일한 UI/UX(라벨 "찜",
// 상태는 하트·배경 채움 대비), 대상만 used_wishlist.
export function UsedWishlistButton({
  listingId,
  initialWished,
  isLoggedIn,
  variant = "card",
  className,
}: {
  listingId: number;
  initialWished: boolean;
  isLoggedIn: boolean;
  variant?: "card" | "detail";
  /** 배치 문맥에 맞춘 크기 조정용(예: 입찰 줄의 h-10). */
  className?: string;
}) {
  const [wished, setWished] = useState(initialWished);
  const [pending, startTransition] = useTransition();
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (variant === "card") {
      e.preventDefault();
      e.stopPropagation();
    }
    if (pending) return;
    if (!isLoggedIn) {
      setLoginPromptOpen(true);
      return;
    }
    const next = !wished;
    setWished(next); // 낙관적
    startTransition(async () => {
      try {
        const res = await toggleUsedWishlist(listingId);
        setWished(res.wished);
      } catch {
        setWished(!next);
        setLoginPromptOpen(true);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={wished ? "찜 해제" : "찜"}
        aria-pressed={wished}
        disabled={pending}
        className={cn(
          "border transition-[background-color,border-color,color,transform] active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
          variant === "card"
            ? "absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full backdrop-blur"
            : "inline-flex h-13 shrink-0 items-center justify-center gap-1.5 rounded-full px-5 text-sm font-medium",
          wished
            ? "border-primary bg-primary text-primary-foreground"
            : variant === "card"
              ? "border-border bg-card/90"
              : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
          className,
        )}
      >
        <Heart
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            wished ? "fill-current" : "text-muted-foreground",
          )}
        />
        {variant === "detail" && <span>찜</span>}
      </button>
      <LoginPromptDialog
        feature="wishlist"
        open={loginPromptOpen}
        onOpenChange={setLoginPromptOpen}
      />
    </>
  );
}
