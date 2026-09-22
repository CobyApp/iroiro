"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MemberWithTeams } from "../types";

type Props = {
  members: MemberWithTeams[];
  teamNameById: Map<number, string>;
  /** 선택 그룹으로 소속 행을 좁힌다. undefined 면 전체 그룹의 소속을 모두 보여준다. */
  teamFilter?: number;
};

// 멤버 목록 — md 이상은 표(히라가나·영문·역할·활동 기간은 lg 부터), 폰은 카드 리스트.
// 행 전체 클릭은 md+ 표에서만 편의로 남기고, 접근성·터치 진입은 명시적인 「편집」 링크가 맡는다.
export function MembersTable({ members, teamNameById, teamFilter }: Props) {
  const router = useRouter();

  function navigateTo(id: number) {
    router.push(`/admin/catalog/members/${id}/edit`);
  }

  type Row = {
    key: string;
    member: MemberWithTeams;
    teamId: number | null;
    role: string | null;
    displayOrder: number | null;
    activeStartDate: string | null;
    activeEndDate: string | null;
  };

  const rows: Row[] = members.flatMap((member): Row[] => {
    if (member.memberships.length === 0) {
      return [
        {
          key: `m-${member.id}-none`,
          member,
          teamId: null,
          role: null,
          displayOrder: null,
          activeStartDate: null,
          activeEndDate: null,
        },
      ];
    }
    return member.memberships.map((tm) => ({
      key: `m-${member.id}-tm-${tm.id}`,
      member,
      teamId: tm.teamId,
      role: tm.role,
      displayOrder: tm.displayOrder,
      activeStartDate: tm.activeStartDate,
      activeEndDate: tm.activeEndDate,
    }));
  });

  // 그룹이 선택된 경우 그 그룹의 소속 행만 남긴다(다중 소속 멤버가 다른 그룹 행으로 중복 노출되지 않도록).
  const shownRows = teamFilter === undefined ? rows : rows.filter((r) => r.teamId === teamFilter);

  const teamNameOf = (teamId: number | null) =>
    teamId !== null ? (teamNameById.get(teamId) ?? "-") : "-";

  if (shownRows.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-card">
        등록된 멤버가 없습니다
      </p>
    );
  }

  return (
    <>
      {/* 폰 — 카드 리스트: 순번 · 한글명 · 일본어 표기 · 소속 그룹 + 편집 링크(44px) */}
      <ul className="divide-y divide-border/70 overflow-hidden rounded-md border border-border bg-card shadow-card md:hidden">
        {shownRows.map((row, index) => {
          const { member } = row;
          return (
            <li key={row.key} className="flex items-center gap-3 px-3 py-2.5">
              <span className="catalog-stat w-7 shrink-0 text-right text-xs text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {member.name}
                  {member.nameI18n?.["ja-jpan"] && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {member.nameI18n["ja-jpan"]}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {teamNameOf(row.teamId)}
                  {row.displayOrder !== null && ` · 순번 ${row.displayOrder}`}
                  {row.role && ` · ${row.role}`}
                </p>
              </div>
              <Link
                href={`/admin/catalog/members/${member.id}/edit`}
                aria-label={`${member.name} 편집`}
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-medium text-primary hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                편집
              </Link>
            </li>
          );
        })}
      </ul>

      {/* md+ — 표. 보조 열(히라가나·영문·역할·활동 기간)은 lg 부터 */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">#</TableHead>
              <TableHead>소속 그룹</TableHead>
              <TableHead className="text-right">순번</TableHead>
              <TableHead>한글명</TableHead>
              <TableHead>일본어 표기</TableHead>
              <TableHead className="hidden lg:table-cell">히라가나 표기</TableHead>
              <TableHead className="hidden lg:table-cell">영문명</TableHead>
              <TableHead className="hidden lg:table-cell">역할</TableHead>
              <TableHead className="hidden xl:table-cell">활동 시작</TableHead>
              <TableHead className="hidden xl:table-cell">활동 종료</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">편집</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shownRows.map((row, index) => {
              const { member } = row;
              return (
                <TableRow
                  key={row.key}
                  onClick={() => navigateTo(member.id)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>{teamNameOf(row.teamId)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {row.displayOrder ?? "-"}
                  </TableCell>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>{member.nameI18n?.["ja-jpan"] ?? "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{member.nameI18n?.["ja-hira"] ?? "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{member.nameI18n?.en ?? "-"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{row.role ?? "-"}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                    {row.activeStartDate ?? "-"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                    {row.activeEndDate ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/catalog/members/${member.id}/edit`}
                      aria-label={`${member.name} 편집`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      편집
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
