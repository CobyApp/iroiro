import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보처리방침" };

// 플레이스홀더 — 실제 개인정보처리방침 문구로 교체 필요.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-8">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="text-sm text-muted-foreground">
        본 문서는 준비 중입니다. 실제 개인정보처리방침 문구로 교체가 필요합니다.
      </p>
    </div>
  );
}
