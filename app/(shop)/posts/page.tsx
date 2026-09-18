import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostList } from "@/modules/posts/components/PostList";
import { CommunityNotices } from "@/modules/notices/components/CommunityNotices";
import { listPosts } from "@/modules/posts/lib/queries";
import { postListParamsSchema } from "@/modules/posts/lib/schema";
import { getCurrentAccount } from "@/modules/auth/dal";
import { getFavorites } from "@/modules/favorites/lib/queries";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { BoardGuide } from "@/modules/posts/components/BoardGuide";

export const metadata: Metadata = { title: "커뮤니티" };

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = postListParamsSchema.parse(params);
  const account = await getCurrentAccount();

  // 최애 필터 — 로그인 + 최애 설정된 사용자만. 미설정 시 필터를 조용히 끈다.
  const favorites = account ? await getFavorites(account.id) : null;
  const hasFaves =
    !!favorites && (favorites.teamIds.length > 0 || favorites.memberIds.length > 0);
  const faveActive = filter.fave && hasFaves;

  const { items, total, pageSize } = await listPosts({
    topic: filter.topic,
    q: filter.q,
    page: filter.page,
    fave: faveActive
      ? { teamIds: favorites!.teamIds, memberIds: favorites!.memberIds }
      : null,
  });

  // 범위 밖 페이지(?page=999 등)는 마지막 유효 페이지로 — 빈 목록·페이저 소실 방지.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (filter.page > totalPages) {
    const sp = new URLSearchParams();
    if (filter.topic) sp.set("topic", filter.topic);
    if (filter.q) sp.set("q", filter.q);
    if (faveActive) sp.set("fave", "1");
    if (totalPages > 1) sp.set("page", String(totalPages));
    const qs = sp.toString();
    redirect(qs ? `/posts?${qs}` : "/posts");
  }

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        title="커뮤니티"
        description="이벤트·정모 소식부터 개봉 자랑·최애 수다까지 — 팬들이 함께 만드는 공간이에요."
        action={
          <Button asChild size="sm" className="gap-1.5">
            <Link href={account ? "/posts/new" : loginRequiredHref("post")}>
              <PenLine className="h-4 w-4" />
              {account ? "글쓰기" : "로그인 후 글쓰기"}
            </Link>
          </Button>
        }
      />

      {/* 공식 공지(운영)·보드 가이드(정적)를 커뮤니티 상단에 통합 — 별도 공지 페이지 폐지 */}
      <Suspense fallback={null}>
        <CommunityNotices />
      </Suspense>
      <BoardGuide topic={filter.topic} />

      {/* filter 변경 시 새로 마운트 — PostList 내부 검색창 상태가 URL과 어긋나지 않게 */}
      <PostList
        key={JSON.stringify({ ...filter, fave: faveActive })}
        items={items}
        total={total}
        filter={{ topic: filter.topic, q: filter.q, page: filter.page, fave: faveActive }}
        canFave={hasFaves}
      />
    </div>
  );
}
