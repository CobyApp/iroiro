import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { isBoardManager } from "@/modules/admin/lib/roles";
import { PostDetail } from "@/modules/posts/components/PostDetail";
import {
  getPostByPublicCode,
  getPostTitleByPublicCode,
} from "@/modules/posts/lib/queries";

type Props = { params: Promise<{ publicCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicCode } = await params;
  // 제목만 필요 — 댓글까지 로드하는 상세 조회 대신 경량 쿼리(상세 렌더에서 재조회는 별개).
  const post = await getPostTitleByPublicCode(publicCode);
  return { title: post ? `${post.title} — 커뮤니티` : "커뮤니티" };
}

export default async function PostDetailPage({ params }: Props) {
  const { publicCode } = await params;
  const account = await getCurrentAccount();
  // 숨김·삭제·미존재 글은 동일 404 — 작성자 본인도 예외 없음(상태 확인은 /posts/my에서).
  const view = await getPostByPublicCode(
    publicCode,
    account?.id ?? null,
    undefined,
    isBoardManager(account),
  );
  if (!view) notFound();

  return <PostDetail view={view} isLoggedIn={account !== null} />;
}
