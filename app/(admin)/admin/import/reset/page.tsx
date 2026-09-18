import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { getPurgePreview } from "@/modules/import/bulk-actions";
import { ResetPanel } from "@/modules/import/components/ResetPanel";
import { listTeams } from "@/modules/teams/lib/queries";
import { listMembers } from "@/modules/members/lib/queries";

// 관리자 — 상품 데이터 초기화 & 대량 재임포트 (백업 → 삭제 → 일괄 가져오기).
export default async function AdminImportResetPage() {
  const [preview, teams, members] = await Promise.all([
    getPurgePreview(),
    listTeams(),
    listMembers(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Toaster />
      <div className="flex items-center gap-2">
        <Link
          href="/admin/import"
          aria-label="뒤로"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">
            데이터 초기화 &amp; 재임포트
          </h2>
          <p className="text-sm text-muted-foreground">
            기존 상품을 백업·삭제하고 외부 카탈로그에서 새로 가져와요.
          </p>
        </div>
      </div>

      <ResetPanel
        preview={preview}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
