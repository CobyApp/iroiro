"use client";

import { useRouter } from "next/navigation";
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

export function TeamsTable({ teams }: Props) {
  const router = useRouter();

  function navigateTo(id: number) {
    router.push(`/catalog/teams/${id}/edit`);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead>한글명</TableHead>
          <TableHead>일본어 표기</TableHead>
          <TableHead>히라가나 표기</TableHead>
          <TableHead>영문명</TableHead>
          <TableHead>데뷔일</TableHead>
          <TableHead>해체일</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {teams.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={7}
              className="h-24 text-center text-muted-foreground"
            >
              등록된 그룹이 없습니다
            </TableCell>
          </TableRow>
        ) : (
          teams.map((team, index) => (
            <TableRow
              key={team.id}
              tabIndex={0}
              role="link"
              aria-label={`${team.name} 그룹 수정`}
              onClick={() => navigateTo(team.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigateTo(team.id);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
            >
              <TableCell className="text-right text-sm text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-2">
                  {/* 그룹 고유색 스와치 — 카탈로그 칩 색과 동일 */}
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full border border-black/10"
                    style={{ background: team.themeColor ?? "var(--primary)" }}
                  />
                  {team.name}
                </span>
              </TableCell>
              <TableCell>{team.nameI18n?.["ja-jpan"] ?? "-"}</TableCell>
              <TableCell>{team.nameI18n?.["ja-hira"] ?? "-"}</TableCell>
              <TableCell>{team.nameI18n?.en ?? "-"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {team.debutDate ?? "-"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {team.disbandDate ?? "-"}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
