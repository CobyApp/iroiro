import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentAccount } from "@/modules/auth/dal";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKstDate } from "@/lib/datetime";
import { isAdmin } from "@/modules/admin/lib/isAdmin";
import { getAdminUserDetail } from "@/modules/admin/lib/users";
import { ADMIN_SPACE_LABEL } from "@/modules/admin/lib/adminRoles";
import { UserAdminControls } from "@/modules/admin/components/UserAdminControls";

export const metadata: Metadata = { title: "회원 상세" };

function won(n: number) {
  return `₩${n.toLocaleString()}`;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const account = await getCurrentAccount();
  if (!isAdmin(account)) redirect("/");
  const { id } = await params;
  const user = await getAdminUserDetail(id);
  if (!user) notFound();

  const a = user.activity;
  const stats: { label: string; value: string }[] = [
    { label: "결제 주문", value: `${a.orderCount.toLocaleString()}건` },
    { label: "총 결제액", value: won(a.orderPaidTotal) },
    { label: "중고 판매", value: `${a.usedSoldCount.toLocaleString()}건` },
    { label: "중고 구매", value: `${a.usedBoughtCount.toLocaleString()}건` },
    { label: "포인트 잔액", value: `${a.pointBalance.toLocaleString()}P` },
    { label: "작성 글", value: `${a.postCount.toLocaleString()}개` },
    { label: "후기", value: `${a.reviewCount.toLocaleString()}개` },
  ];

  return (
    <AdminPage className="space-y-6">
      <AdminPageHeader title={user.displayName}>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
        </Button>
      </AdminPageHeader>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="font-mono">{user.publicCode}</span>
        <span aria-hidden>·</span>
        <span>가입 {formatKstDate(user.createdAt)}</span>
        {user.isAdmin && <Badge>사이트 관리자</Badge>}
        {user.adminRoles.map((r) => (
          <Badge key={r} variant="outline">
            {ADMIN_SPACE_LABEL[r]}
          </Badge>
        ))}
        {user.postingBanned && (
          <Badge variant="destructive">
            작성 제재{user.postingBanReason ? ` · ${user.postingBanReason}` : ""}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>활동 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-border/70 bg-card/70 px-3.5 py-3"
              >
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="mt-1 font-display text-lg text-foreground">{s.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>권한 · 제재</CardTitle>
        </CardHeader>
        <CardContent>
          <UserAdminControls user={user} isSelf={user.id === account!.id} />
        </CardContent>
      </Card>
    </AdminPage>
  );
}
