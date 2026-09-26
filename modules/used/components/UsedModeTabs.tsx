import Link from "next/link";

// 팝니다(매물) ↔ 삽니다(매입 요청) 전환 탭 — 중고거래 홈과 삽니다 목록 상단 공용.
export function UsedModeTabs({ active }: { active: "sell" | "buy" }) {
  const tab = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      className={`flex-1 rounded-full px-4 py-2 text-center text-sm font-medium transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 rounded-full border border-border bg-card p-1" data-page-section>
      {tab("/used", "팝니다", active === "sell")}
      {tab("/used/wanted", "삽니다", active === "buy")}
    </div>
  );
}
