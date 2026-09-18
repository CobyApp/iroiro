import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { MyPosts } from "@/modules/posts/components/MyPosts";
import { listMyPosts } from "@/modules/posts/lib/queries";
import { postListParamsSchema } from "@/modules/posts/lib/schema";

export const metadata: Metadata = { title: "내 글" };

export default async function MyPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("post"));

  const params = await searchParams;
  const { page } = postListParamsSchema.parse(params);
  const { items, total, pageSize } = await listMyPosts(account.id, page);

  // 범위 밖 페이지는 마지막 유효 페이지로 — 빈 목록·페이저 소실 방지.
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) {
    redirect(totalPages > 1 ? `/posts/my?page=${totalPages}` : "/posts/my");
  }

  return (
    <div className="shop-page-frame space-y-4">
      <h1 className="text-2xl font-bold">내 글</h1>
      <MyPosts items={items} total={total} page={page} pageSize={pageSize} />
    </div>
  );
}
