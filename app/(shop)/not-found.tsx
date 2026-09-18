import Link from "next/link";
import { Button } from "@/components/ui/button";

// (shop) 하위 404 — Next 기본 404는 OS 다크모드에서 흰 글씨라 고정 라이트 테마 배경에
// 묻힌다. 앱 토큰으로 스타일링하고 shop 레이아웃(헤더) 안에서 렌더되게 한다.
export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-card p-12 text-center">
      <p className="text-4xl font-bold text-foreground">404</p>
      <div className="space-y-1">
        <p className="font-medium text-foreground">페이지를 찾을 수 없습니다</p>
        <p className="text-sm text-muted-foreground">
          주소가 잘못되었거나, 삭제·비공개 처리된 페이지일 수 있습니다.
        </p>
      </div>
      <Button asChild>
        <Link href="/">홈으로 가기</Link>
      </Button>
    </div>
  );
}
