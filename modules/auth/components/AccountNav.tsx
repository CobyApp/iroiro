import Link from "next/link";
import { User } from "lucide-react";

import type { Account } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";

// 헤더 우측 계정 영역 — 로그인 시 마이페이지 바로가기, 아니면 로그인 버튼.
// 드롭다운 없이 마이페이지로 직행한다(컬렉션·찜·주문·설정은 하단 탭과 마이페이지
// 안에 이미 있어 메뉴 중복을 없앤다). DB 미가동·세션 실패는 로그아웃 상태로 처리.
export async function AccountNav() {
  let account: Account | null = null;
  try {
    account = await getCurrentAccount();
  } catch {
    account = null;
  }

  if (!account) {
    return (
      <Button variant="default" size="sm" asChild>
        <Link href="/login">로그인</Link>
      </Button>
    );
  }

  // 모바일은 하단 탭의 "마이"가 담당하므로 상단 마이 버튼은 데스크톱에서만 노출.
  return (
    <Button
      variant="ghost"
      size="sm"
      asChild
      aria-label="마이페이지"
      className="hidden sm:inline-flex"
    >
      <Link href="/mypage" className="gap-1 px-2.5">
        <User className="h-4 w-4" />
        <span className="hidden lg:inline">마이</span>
      </Link>
    </Button>
  );
}
