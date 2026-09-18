import Link from "next/link";
import { Button } from "@/components/ui/button";

// 루트 폴백 404 — (shop) 등 그룹 레이아웃 밖 경로용. 루트 레이아웃엔 배경 클래스가
// 없으므로 배경·전경을 직접 지정해 다크모드에서도 대비가 유지되게 한다.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <p className="text-4xl font-bold">404</p>
      <div className="space-y-1">
        <p className="font-medium">페이지를 찾을 수 없습니다</p>
        <p className="text-sm text-muted-foreground">
          주소가 잘못되었거나, 삭제·비공개 처리된 페이지일 수 있습니다.
        </p>
      </div>
      <Button asChild>
        <Link href="/">홈으로 가기</Link>
      </Button>
    </main>
  );
}
