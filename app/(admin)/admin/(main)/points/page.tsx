import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatKstDateTime } from "@/lib/datetime";
import { AdminPage } from "@/modules/admin/components/AdminPage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";
import {
  getCouponAdminSummary,
  listPointTransactionsForAdmin,
} from "@/modules/points/lib/admin-queries";
import { AdminPointsGrantForm } from "@/modules/points/components/AdminPointsGrantForm";
import {
  POINT_REASON_LABEL,
  type PointReason,
} from "@/modules/points/lib/rules";

export const metadata = { title: "포인트 · 쿠폰 관리" };

function reasonLabel(reason: string): string {
  return POINT_REASON_LABEL[reason as PointReason] ?? reason;
}

export default async function AdminPointsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const [result, coupons] = await Promise.all([
    listPointTransactionsForAdmin(q, page),
    getCouponAdminSummary(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const couponKindLabel = (k: string) => (k === "free_shipping" ? "무료배송" : k);
  const pageHref = (p: number) =>
    `/admin/points?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <AdminPage>
      <AdminPageHeader title="포인트 · 쿠폰" count={result.total}>
        <form action="/admin/points" className="w-full sm:w-72">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="회원 닉네임 또는 #공개코드"
            aria-label="회원 검색"
            className="h-9 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus:border-primary/50"
          />
        </form>
      </AdminPageHeader>

      <AdminPointsGrantForm />

      {/* 발급 쿠폰 현황 — 총/미사용/사용 요약 + 최근 발급 */}
      <section className="space-y-2">
        <h3 className="pt-2 text-sm font-semibold">쿠폰 현황</h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "총 발급", value: coupons.total },
            { label: "미사용", value: coupons.unused },
            { label: "사용됨", value: coupons.used },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border/70 bg-card/70 px-3.5 py-2.5"
            >
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-display text-lg text-foreground">
                {s.value.toLocaleString()}장
              </p>
            </div>
          ))}
        </div>
        {coupons.recent.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {coupons.recent.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {c.accountId ? (
                    <Link
                      href={`/admin/users/${c.accountId}`}
                      className="underline-offset-2 hover:text-primary hover:underline"
                    >
                      {c.accountName}
                    </Link>
                  ) : (
                    c.accountName
                  )}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {couponKindLabel(c.kind)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.used ? "사용됨" : "미사용"} · {formatKstDateTime(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <h3 className="pt-2 text-sm font-semibold">
        포인트 내역 {q ? `— "${q}"` : "(전체 회원)"}
      </h3>
      {result.items.length === 0 ? (
        <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {q ? "검색 결과가 없습니다" : "아직 내역이 없습니다"}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회원</TableHead>
              <TableHead className="text-right">포인트</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>메모</TableHead>
              <TableHead>일시</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="py-2.5">
                  {row.accountId ? (
                    <Link
                      href={`/admin/users/${row.accountId}`}
                      className="underline-offset-2 hover:text-primary hover:underline"
                    >
                      {row.accountName}
                    </Link>
                  ) : (
                    row.accountName
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "py-2.5 text-right font-medium tabular-nums",
                    row.amount > 0 && "text-primary",
                  )}
                >
                  {row.amount > 0 ? "+" : ""}
                  {row.amount.toLocaleString()}P
                </TableCell>
                <TableCell className="py-2.5">{reasonLabel(row.reason)}</TableCell>
                <TableCell className="max-w-[220px] py-2.5">
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {row.memo ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                  {formatKstDateTime(row.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 pt-2" aria-label="포인트 내역 페이지">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">
              이전
            </Link>
          ) : (
            <span className="rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground/50">이전</span>
          )}
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">
              다음
            </Link>
          ) : (
            <span className="rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground/50">다음</span>
          )}
        </nav>
      )}
    </AdminPage>
  );
}
