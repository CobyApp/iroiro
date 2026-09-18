"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createComment, updateComment } from "../actions";
import { COMMENT_BODY_MAX } from "../lib/schema";

type Props = {
  postId: number;
  /** 답글 작성 — 최상위 댓글 id. */
  parentId?: number;
  /** 존재하면 수정 모드(해당 댓글 id). */
  commentId?: number;
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  /** 등록·수정 성공 후 호출 — 답글/수정 인라인 UI 접기용. */
  onDone?: () => void;
  onCancel?: () => void;
};

export function CommentForm({
  postId,
  parentId,
  commentId,
  initialBody = "",
  placeholder = "댓글을 입력해주세요",
  submitLabel,
  autoFocus = false,
  onDone,
  onCancel,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [pending, startTransition] = useTransition();
  const isEdit = commentId !== undefined;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) {
      toast.error("댓글 내용을 입력해주세요");
      return;
    }

    startTransition(async () => {
      const result = isEdit
        ? await updateComment({ id: commentId, body })
        : await createComment({ postId, parentId, body });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
      if (!isEdit) setBody("");
      onDone?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={isEdit || parentId !== undefined ? 2 : 3}
        maxLength={COMMENT_BODY_MAX}
        autoFocus={autoFocus}
        disabled={pending}
        required
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            취소
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {pending ? "등록 중..." : (submitLabel ?? (isEdit ? "수정" : "등록"))}
        </Button>
      </div>
    </form>
  );
}
