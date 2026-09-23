import type { Metadata } from "next";
import { BrandMark } from "@/modules/ui/components/BrandMark";

export const metadata: Metadata = { title: "로그인 완료" };

// Safari(외부 브라우저)에서 PWA 페어링 로그인이 끝난 뒤 도착하는 화면.
// 세션은 이미 앱이 폴링으로 받아가므로, 여기선 앱으로 돌아가라고 안내만 한다.
export default function LoginPairedPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center pt-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15">
        <BrandMark className="h-12 w-12" />
      </div>
      <h1 className="mt-6 font-display text-2xl text-foreground">로그인 완료!</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        이제 <b className="text-foreground">이로이로 앱</b>으로 돌아가 주세요.
        <br />앱이 자동으로 로그인 상태로 전환돼요.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        이 창은 닫으셔도 됩니다.
      </p>
    </div>
  );
}
