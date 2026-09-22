"use client";

import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKstDate } from "@/lib/datetime";
import { NOTICE_CATEGORY_LABELS } from "../types";
import type { Notice } from "../types";

type Props = {
  notices: Notice[];
};

export function NoticesTable({ notices }: Props) {
  const router = useRouter();

  function navigateTo(id: number) {
    router.push(`/admin/posts/notices/${id}/edit`);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead className="w-12">고정</TableHead>
          <TableHead className="w-20">카테고리</TableHead>
          <TableHead>제목</TableHead>
          <TableHead className="w-28">작성일</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {notices.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={5}
              className="h-24 text-center text-muted-foreground"
            >
              등록된 공지가 없습니다
            </TableCell>
          </TableRow>
        ) : (
          notices.map((notice, index) => (
            <TableRow
              key={notice.id}
              tabIndex={0}
              role="link"
              aria-label={`공지 "${notice.title}" 수정`}
              onClick={() => navigateTo(notice.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigateTo(notice.id);
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
            >
              <TableCell className="text-right text-sm text-muted-foreground">
                {index + 1}
              </TableCell>
              <TableCell>
                {notice.isPinned ? (
                  <Pin aria-hidden className="h-4 w-4 text-primary" />
                ) : null}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {NOTICE_CATEGORY_LABELS[notice.category]}
              </TableCell>
              <TableCell className="font-medium">{notice.title}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatKstDate(notice.createdAt)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
