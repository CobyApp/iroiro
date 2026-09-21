import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { PostForm } from "@/modules/posts/components/PostForm";
import { getEditablePost } from "@/modules/posts/lib/queries";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";

export const metadata: Metadata = { title: "글 수정" };

type Props = { params: Promise<{ publicCode: string }> };

export default async function PostEditPage({ params }: Props) {
  const { publicCode } = await params;
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("post"));

  const [result, teams, members] = await Promise.all([
    getEditablePost(publicCode, account.id),
    listTeams(),
    listMembers(),
  ]);
  if (!result) notFound();

  return (
    <div className="shop-page-frame space-y-4">
      <h1 className="text-2xl font-bold">글 수정</h1>
      <PostForm
        mode="edit"
        post={result.post}
        lockedReason={result.lockedReason}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        members={members.map((m) => ({ id: m.id, name: m.name, teamIds: m.teamIds }))}
        publicBaseUrl={env.CATALOG_PUBLIC_BASE}
      />
    </div>
  );
}
