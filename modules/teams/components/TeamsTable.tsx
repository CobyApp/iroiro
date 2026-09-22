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
import type { Team } from "../types";

type Props = {
  teams: Team[];
};

// 그룹 목록 — md 이상은 표(히라가나·영문·해체일은 lg 부터), 폰은 카드 리스트.
// 행 전체 클릭은 md+ 표에서만 편의로 남기고, 접근성·터치 진입은 명시적인 「편집」 링크가 맡는다.
export function TeamsTable({ teams }: Props) {
  const router = useRouter();

  function navigateTo(id: number) {
    router.push(`/admin/catalog/teams/${id}/edit`);
  }

  if (teams.length === 0) {
    return (
      <p className="rounded-md border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-card">
        등록된 그룹이 없습니다
      </p>
    );
  }

  // 그룹 고유색 스와치 — 카탈로그 칩 색과 동일
  const swatch = (team: Team) => (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
      style={{ background: team.themeColor ?? "var(--primary)" }}
    />
  );

  return (
    <>
      {/* 폰 — 카드 리스트: 순번 · 한글명 · 일본어 표기 · 데뷔일 + 편집 링크(44px) */}
      <ul className="divide-y divide-border/70 overflow-hidden rounded-md border border-border bg-card shadow-card md:hidden">
        {teams.map((team, index) => (
          <li key={team.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="catalog-stat w-5 shrink-0 text-right text-xs text-muted-foreground">
              {index + 1}
            </span>
            {swatch(team)}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {team.name}
                {team.nameI18n?.["ja-jpan"] && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {team.nameI18n["ja-jpan"]}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {team.debutDate ? `데뷔 ${team.debutDate}` : "데뷔일 미입력"}
                {team.disbandDate && ` · 해체 ${team.disbandDate}`}
              </p>
            </div>
            <Link
              href={`/admin/catalog/teams/${team.id}/edit`}
              aria-label={`${team.name} 편집`}
              className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-xs font-medium text-primary hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              편집
            </Link>
          </li>
        ))}
      </ul>

      {/* md+ — 표. 보조 열(히라가나·영문·해체일)은 lg 부터 */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">#</TableHead>
              <TableHead>한글명</TableHead>
              <TableHead>일본어 표기</TableHead>
              <TableHead className="hidden lg:table-cell">히라가나 표기</TableHead>
              <TableHead className="hidden lg:table-cell">영문명</TableHead>
              <TableHead>데뷔일</TableHead>
              <TableHead className="hidden lg:table-cell">해체일</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">편집</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team, index) => (
              <TableRow
                key={team.id}
                onClick={() => navigateTo(team.id)}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <TableCell className="text-right text-sm text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {swatch(team)}
                    {team.name}
                  </span>
                </TableCell>
                <TableCell>{team.nameI18n?.["ja-jpan"] ?? "-"}</TableCell>
                <TableCell className="hidden lg:table-cell">{team.nameI18n?.["ja-hira"] ?? "-"}</TableCell>
                <TableCell className="hidden lg:table-cell">{team.nameI18n?.en ?? "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {team.debutDate ?? "-"}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {team.disbandDate ?? "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/admin/catalog/teams/${team.id}/edit`}
                    aria-label={`${team.name} 편집`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    편집
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
