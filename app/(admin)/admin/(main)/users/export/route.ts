import { getCurrentAccount } from "@/modules/auth/dal";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { listAdminUsers } from "@/modules/admin/lib/users";
import { ADMIN_SPACE_LABEL } from "@/modules/admin/lib/adminRoles";
import { formatKstDateTime, todayKstYmd } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 회원 CSV 내보내기 — 검색어(q)를 반영. site admin 전용(라우트 자체 가드).
export async function GET(request: Request): Promise<Response> {
  const account = await getCurrentAccount();
  if (!isAdmin(account)) return new Response("forbidden", { status: 403 });

  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  const users = await listAdminUsers(q, 5000);

  const header = [
    "닉네임",
    "공개코드",
    "사이트관리자",
    "부분권한",
    "작성제재",
    "제재사유",
    "가입일시",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const u of users) {
    lines.push(
      [
        u.displayName,
        u.publicCode,
        u.isAdmin ? "Y" : "",
        u.adminRoles.map((r) => ADMIN_SPACE_LABEL[r]).join(" · "),
        u.postingBanned ? "Y" : "",
        u.postingBanReason ?? "",
        formatKstDateTime(u.createdAt),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="iroiro-users-${todayKstYmd()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
