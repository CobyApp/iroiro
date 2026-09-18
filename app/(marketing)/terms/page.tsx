import type { Metadata } from "next";

export const metadata: Metadata = { title: "이용약관" };

// 플레이스홀더 — 실제 이용약관 문구로 교체 필요.
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <h1 className="text-2xl font-bold">이용약관</h1>
      <p className="text-sm text-muted-foreground">
        본 문서는 준비 중입니다. 실제 이용약관 문구로 교체가 필요합니다.
      </p>
    </div>
  );
}
