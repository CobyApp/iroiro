"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquare, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatKstDate } from "@/lib/datetime";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { createUsedComment, deleteUsedComment } from "../comment-actions";
import type { UsedComment, UsedCommentNode } from "../types";

// 중고 매물 공개 댓글 — 모든 회원이 대화. 최상위 댓글 + 1단계 대댓글.
export function UsedCommentSection({
  listingId,
  comments,
  isLoggedIn,
  viewerAccountId = null,
}: {
  listingId: number;
  comments: UsedCommentNode[];
  isLoggedIn: boolean;
  viewerAccountId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const total = comments.reduce(
    (sum, c) => sum + 1 + c.replies.length,
    0,
  );

  function submit(body: string, parentId: number | null, onDone: () => void) {
    startTransition(async () => {
      const result = await createUsedComment({ listingId, parentId, body });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  function remove(commentId: number) {
    startTransition(async () => {
      const result = await deleteUsedComment(commentId);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-4 pt-2">
      <h2 className="flex items-center gap-1.5 text-base font-bold text-foreground">
        <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
        댓글 {total > 0 && <span className="text-muted-foreground">{total}</span>}
      </h2>

      {isLoggedIn ? (
        <CommentInput
          placeholder="매물에 대해 궁금한 점을 남겨보세요"
          pending={pending}
          onSubmit={(body, reset) => submit(body, null, reset)}
        />
      ) : (
        <Link
          href={loginRequiredHref("post")}
          className="block rounded-md border border-border bg-card/60 px-4 py-3 text-center text-sm text-muted-foreground hover:bg-muted/50"
        >
          로그인하고 댓글을 남겨보세요
        </Link>
      )}

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          아직 댓글이 없어요. 첫 댓글을 남겨보세요.
        </p>
      ) : (
        <ul className="space-y-4">
          {comments.map((node) => (
            <li key={node.id} className="space-y-3">
              <CommentRow
                comment={node}
                isLoggedIn={isLoggedIn}
                viewerAccountId={viewerAccountId}
                pending={pending}
                onReply={() =>
                  setReplyTo((prev) => (prev === node.id ? null : node.id))
                }
                onDelete={() => remove(node.id)}
              />
              {/* 대댓글 */}
              {(node.replies.length > 0 || replyTo === node.id) && (
                <ul className="ml-6 space-y-3 border-l border-border/60 pl-4">
                  {node.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        isLoggedIn={isLoggedIn}
                        viewerAccountId={viewerAccountId}
                        pending={pending}
                        onDelete={() => remove(reply.id)}
                      />
                    </li>
                  ))}
                  {replyTo === node.id && isLoggedIn && (
                    <li>
                      <CommentInput
                        placeholder={`${node.authorName}님에게 답글`}
                        pending={pending}
                        autoFocus
                        onSubmit={(body, reset) =>
                          submit(body, node.id, () => {
                            reset();
                            setReplyTo(null);
                          })
                        }
                      />
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentRow({
  comment,
  isLoggedIn,
  viewerAccountId,
  pending,
  onReply,
  onDelete,
}: {
  comment: UsedComment;
  isLoggedIn: boolean;
  viewerAccountId: string | null;
  pending: boolean;
  onReply?: () => void;
  onDelete: () => void;
}) {
  const isOwn =
    !comment.deleted &&
    viewerAccountId !== null &&
    comment.accountId === viewerAccountId;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.authorName}</span>
        <span>{formatKstDate(comment.createdAt)}</span>
        {comment.edited && !comment.deleted && <span>· 수정됨</span>}
      </div>
      <p
        className={
          comment.deleted
            ? "whitespace-pre-wrap text-sm italic text-muted-foreground"
            : "whitespace-pre-wrap text-sm text-foreground"
        }
      >
        {comment.body}
      </p>
      {!comment.deleted && (
        <div className="flex items-center gap-3 pt-0.5">
          {onReply && isLoggedIn && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CornerDownRight className="h-3 w-3" aria-hidden />
              답글
            </button>
          )}
          {isOwn && (
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  삭제
                </button>
              }
              title="댓글을 삭제할까요?"
              description="삭제하면 되돌릴 수 없어요."
              confirmLabel="삭제"
              destructive
              pending={pending}
              onConfirm={onDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CommentInput({
  placeholder,
  pending,
  autoFocus = false,
  onSubmit,
}: {
  placeholder: string;
  pending: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string, reset: () => void) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={2}
        maxLength={1000}
        className="w-full resize-none rounded-md border border-border bg-card/80 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending || value.trim().length === 0}
          onClick={() => onSubmit(value.trim(), () => setValue(""))}
        >
          {pending ? "등록 중…" : "등록"}
        </Button>
      </div>
    </div>
  );
}
