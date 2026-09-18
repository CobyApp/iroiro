import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { PostForm } from "@/modules/posts/components/PostForm";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";

export const metadata: Metadata = { title: "글쓰기" };

export default async function PostNewPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("post"));

  const [teams, members] = await Promise.all([listTeams(), listMembers()]);

  return (
    <div className="shop-page-frame space-y-4">
      <h1 className="text-2xl font-bold">글쓰기</h1>
      <PostForm
        mode="new"
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        members={members.map((m) => ({ id: m.id, name: m.name, teamIds: m.teamIds }))}
        publicBaseUrl={env.R2_PUBLIC_BASE}
      />
    </div>
  );
}
