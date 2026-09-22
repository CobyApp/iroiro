import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Banner } from "@/modules/banners/types";
import { isBannerActiveAt } from "@/modules/banners/lib/active";
import { DeleteBannerButton } from "./DeleteBannerButton";

// 관리자 배너 리스트. 게시중 여부는 서버 렌더 시점 기준 표시.
export function BannersTable({
  banners,
  publicBase,
}: {
  banners: Banner[];
  publicBase: string;
}) {
  const now = new Date();

  if (banners.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">등록된 배너가 없습니다.</p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {banners.map((b) => {
        const active = isBannerActiveAt(
          b.startsAt ? new Date(b.startsAt) : null,
          b.endsAt ? new Date(b.endsAt) : null,
          now,
        );
        return (
          // 폰에서는 배지·버튼이 아래 줄로 내려간다(flex-wrap).
          <li key={b.id} className="flex flex-wrap items-center gap-3 p-3 sm:gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- R2 이미지 */}
            <img
              src={`${publicBase}/${b.imageKey}`}
              alt=""
              className="h-12 w-28 shrink-0 rounded border border-border object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{b.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {b.linkUrl}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.startsAt?.slice(0, 10) ?? "무제한"} ~{" "}
                {b.endsAt?.slice(0, 10) ?? "무제한"} · 순서 {b.sortOrder}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant={active ? "default" : "outline"}>
                {active ? "게시중" : "비활성"}
              </Badge>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/admin/banners/${b.id}/edit`}>수정</Link>
              </Button>
              <DeleteBannerButton id={b.id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
