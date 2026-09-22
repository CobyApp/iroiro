"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberQuickAddDialog, type QuickAddTeamOption } from "./MemberQuickAddDialog";

// 멤버 목록 헤더의 「빠른 추가」 — 다이얼로그를 열고, 추가되면 서버 데이터를 다시 받아 목록에 바로 나타난다.
export function MemberQuickAddButton({ teams }: { teams: QuickAddTeamOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Zap className="h-4 w-4" />
        빠른 추가
      </Button>
      <MemberQuickAddDialog
        open={open}
        onOpenChange={setOpen}
        teams={teams}
        onCreated={() => router.refresh()}
      />
    </>
  );
}
