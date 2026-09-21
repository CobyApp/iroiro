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
import type { MemberWithTeams } from "../types";

type Props = {
  members: MemberWithTeams[];
  teamNameById: Map<number, string>;
};

export function MembersTable({ members, teamNameById }: Props) {
  const router = useRouter();

  function navigateTo(id: number) {
    router.push(`/catalog/members/${id}/edit`);
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead>소속 그룹</TableHead>
          <TableHead className="w-16 text-right">순번</TableHead>
          <TableHead>한글명</TableHead>
          <TableHead>일본어 표기</TableHead>
          <TableHead>히라가나 표기</TableHead>
          <TableHead>영문명</TableHead>
          <TableHead>역할</TableHead>
          <TableHead>활동 시작</TableHead>
          <TableHead>활동 종료</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={10}
              className="h-24 text-center text-muted-foreground"
            >
              등록된 멤버가 없습니다
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, index) => {
            const { member } = row;
            const teamName =
              row.teamId !== null
                ? (teamNameById.get(row.teamId) ?? "-")
                : "-";
            return (
              <TableRow
                key={row.key}
                tabIndex={0}
                role="link"
                aria-label={`${member.name} 멤버 수정`}
                onClick={() => navigateTo(member.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigateTo(member.id);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
              >
                <TableCell className="text-right text-sm text-muted-foreground">
                  {index + 1}
                </TableCell>
                <TableCell>{teamName}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {row.displayOrder ?? "-"}
                </TableCell>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell>{member.nameI18n?.["ja-jpan"] ?? "-"}</TableCell>
                <TableCell>{member.nameI18n?.["ja-hira"] ?? "-"}</TableCell>
                <TableCell>{member.nameI18n?.en ?? "-"}</TableCell>
                <TableCell>{row.role ?? "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.activeStartDate ?? "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.activeEndDate ?? "-"}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
