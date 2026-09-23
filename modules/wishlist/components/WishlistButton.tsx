import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getWishlistCount } from "../lib/queries";

// 헤더 찜 진입점(장바구니 왼쪽). 로그인 시 찜한 상품 수를 뱃지로 표시. 서버 컴포넌트 —
// 레이아웃에서 Suspense로 감싼다(신원·카운트 조회). 하단 탭바의 찜 탭을 대체한다.
export async function WishlistButton() {
  const account = await getCurrentAccount();
  // 비로그인 상태에선 숨긴다 — 상단에 로그인 버튼만 노출.
  if (!account) return null;
  const count = await getWishlistCount(account.id);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2.5"
      asChild
      aria-label="찜"
    >
      <Link href="/wishlist" className="relative">
        <Heart className="h-5 w-5" />
        <span className="hidden lg:inline">찜</span>
        {count > 0 && (
          <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none">
            {count}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
