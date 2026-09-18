import Link from "next/link";
import { LockKeyhole, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  benefits: readonly string[];
  secondaryHref?: string;
  secondaryLabel?: string;
  loginLabel?: string;
};

// 개인 데이터는 노출하지 않되, 비로그인 방문자가 기능과 다음 행동을 볼 수 있는 안내 화면.
export function GuestFeatureGate({
  icon: Icon,
  title,
  description,
  benefits,
  secondaryHref = "/products",
  secondaryLabel = "상품 둘러보기",
  loginLabel = "로그인하고 시작하기",
}: Props) {
  return (
    <div className="shop-page-frame space-y-5">
      <div className="rounded-md border border-border bg-card p-6 shadow-card sm:p-8">
        <div>
          <span className="mb-5 grid h-14 w-14 place-items-center rounded-sm bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </span>
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-[0.12em] text-primary">
            <LockKeyhole className="h-3.5 w-3.5" />
            로그인하면 내 정보로 이어져요
          </p>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li
                key={benefit}
                className="flex items-center gap-2 rounded-xs border border-border/70 bg-muted/45 px-3 py-2 text-sm"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/login">{loginLabel}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        상품·커뮤니티·공지사항은 로그인 없이 자유롭게 둘러볼 수 있어요.
      </p>
    </div>
  );
}
