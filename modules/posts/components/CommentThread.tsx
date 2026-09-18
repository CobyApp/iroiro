"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKstDateTime, formatKstRelative } from "@/lib/datetime";
import { deleteComment } from "../actions";
import type { PostComment } from "../types";
import { CommentForm } from "./CommentForm";
import { ReportDialog } from "./ReportDialog";

type Props = {
  postId: number;
  comments: PostComment[];
};

// 2단 렌더 — 최상위는 답글(항상 1단) 목록을 그 아래 들여쓰기로 붙인다.
// 트리 필터링(삭제·숨김 플레이스홀더 유지 여부)은 buildCommentTree(Task 3)가 이미 처리 —
// 여기서는 받은 comments를 그대로 렌더한다.
export function CommentThread({ postId, comments }: Props) {
  if (comments.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        첫 댓글을 남겨보세요
      </p>
    );
  }

  return (
    <ul className="space-y-5">
      {comments.map((comment) => (
        <li key={comment.id} className="space-y-3">
          <CommentItem postId={postId} comment={comment} />
          {comment.replies.length > 0 && (
            <ul className="space-y-3 border-l border-border pl-4">
              {comment.replies.map((reply) => (
                <li key={reply.id}>
                  <CommentItem postId={postId} comment={reply} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function CommentItem({
  postId,
  comment,
}: {
  postId: number;
  comment: PostComment;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
      setConfirmOpen(false);
    });
  }

  // 본인 숨김(hiddenReason 노출)만 본문+사유 뱃지, 타인 숨김은 플레이스홀더.
  const ownHidden = comment.status === "hidden" && comment.hiddenReason !== null;
  const bodyText =
    comment.status === "deleted"
      ? "삭제된 댓글입니다"
      : comment.status === "hidden" && !ownHidden
        ? "운영 정책 위반으로 숨김 처리된 댓글입니다"
        : comment.body;
  // 버튼은 DTO capability 그대로 — 상태 재판단 없음.
  const hasActions =
    comment.canReply || comment.canEdit || comment.canDelete || comment.canReport;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{comment.authorName}</span>
        <span className="text-xs text-muted-foreground">#{comment.authorCode}</span>
        {/* 상대 표기는 읽기 쉬운 대신 정확도를 잃는다 — title에 절대 시각을 병기한다. */}
        <time
          dateTime={comment.createdAt}
          title={formatKstDateTime(comment.createdAt)}
          className="text-xs text-muted-foreground"
        >
          {formatKstRelative(comment.createdAt)}
        </time>
        {comment.editedAt && (
          <span
            title={`수정됨 · ${formatKstDateTime(comment.editedAt)}`}
            className="text-xs text-muted-foreground"
          >
            (수정됨)
          </span>
        )}
      </div>

      {editing ? (
        <CommentForm
          postId={postId}
          commentId={comment.id}
          initialBody={comment.body ?? ""}
          autoFocus
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words text-sm">{bodyText}</p>
          {ownHidden && (
            <Badge
              variant="outline"
              className="max-w-full whitespace-normal break-words border-amber-300 bg-amber-50 font-normal text-amber-700"
            >
              숨김: {comment.hiddenReason}
            </Badge>
          )}
        </>
      )}

      {!editing && hasActions && (
        <div className="flex gap-1">
          {comment.canReply && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-1 text-xs text-muted-foreground"
              onClick={() => setReplying((value) => !value)}
            >
              답글
            </Button>
          )}
          {comment.canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-1 text-xs text-muted-foreground"
              onClick={() => setEditing(true)}
            >
              수정
            </Button>
          )}
          {comment.canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-1 text-xs text-muted-foreground"
              onClick={() => setConfirmOpen(true)}
            >
              삭제
            </Button>
          )}
          {comment.canReport && <ReportDialog target="comment" targetId={comment.id} />}
        </div>
      )}

      {replying && (
        <div className="pt-1">
          <CommentForm
            postId={postId}
            parentId={comment.id}
            autoFocus
            submitLabel="답글 등록"
            placeholder="답글을 입력해주세요"
            onDone={() => setReplying(false)}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}

      {comment.canDelete && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>댓글 삭제</DialogTitle>
              <DialogDescription>삭제한 댓글은 되돌릴 수 없습니다.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={pending}
              >
                {pending ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
