import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";
import { BuyRequestForm } from "@/modules/used/components/BuyRequestForm";

export const metadata: Metadata = { title: "삽니다 등록" };

// 삽니다(매입 요청) 등록 — 로그인 필요. 그룹·멤버는 카탈로그에서.
export default async function BuyRequestNewPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login-required?from=/used/wanted/new");

  const [teams, members] = await Promise.all([listTeams(), listMembers()]);

  return (
    <div className="shop-page-frame space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">삽니다 등록</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          사고 싶은 카드와 예산을 올리면 판매자가 오퍼(팔게요)를 보내요.
        </p>
      </div>
      <BuyRequestForm
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        members={members.map((m) => ({ id: m.id, name: m.name, teamIds: m.teamIds }))}
      />
    </div>
  );
}
