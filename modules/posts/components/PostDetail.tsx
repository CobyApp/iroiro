"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronLeft,
  ExternalLink,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDday, formatKstDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { deletePost, moderatorDeletePost } from "../actions";
import { POST_TOPIC_EMOJI, POST_TOPIC_LABELS, type PostDetailView } from "../types";
import { CommentForm } from "./CommentForm";
import { CommentThread } from "./CommentThread";
import { ReportDialog } from "./ReportDialog";
import { MessageUserButton } from "@/modules/messages/components/MessageUserButton";

type Props = {
  view: PostDetailView;
  isLoggedIn: boolean;
};

export function PostDetail({ view, isLoggedIn }: Props) {
  const { post, capabilities, comments } = view;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("글이 삭제되었습니다");
      router.push("/posts");
    });
  }

  // 관리자 삭제 — 타인 글 관리(requireBoardManager). 되돌릴 수 없어 확인 후 실행.
  function handleModeratorDelete() {
    if (!window.confirm("이 글을 관리자 권한으로 삭제할까요? 되돌릴 수 없습니다.")) {
      return;
    }
    startTransition(async () => {
      const result = await moderatorDeletePost(post.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("글을 삭제했어요 (관리)");
      router.push("/posts");
    });
  }

  return (
    <article className="shop-page-frame space-y-6">
      <Link
        href="/posts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        커뮤니티 목록
      </Link>

      <header className="space-y-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {POST_TOPIC_EMOJI[post.topic]} {POST_TOPIC_LABELS[post.topic]}
          </span>
          {(post.tag.memberName ?? post.tag.teamName) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Sparkles aria-hidden className="h-3 w-3" />
              {post.tag.memberName ?? post.tag.teamName}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold break-words">{post.title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {post.authorName} #{post.authorCode} ·{" "}
            {formatKstDateTime(post.createdAt)}
            {post.editedAt && (
              <span className="ml-1 text-xs">
                (수정됨 · {formatKstDateTime(post.editedAt)})
              </span>
            )}
          </p>
          {(capabilities.canEdit ||
            capabilities.canDelete ||
            capabilities.canReport ||
            capabilities.canModerate ||
            capabilities.canMessageAuthor) && (
            <div className="flex gap-1">
              {capabilities.canMessageAuthor && (
                <MessageUserButton
                  postPublicCode={post.publicCode}
                  toName={post.authorName}
                  isLoggedIn={isLoggedIn}
                  contextLabel={post.title}
                  variant="outline"
                  size="sm"
                />
              )}
              {capabilities.canEdit && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/posts/${post.publicCode}/edit`}>수정</Link>
                </Button>
              )}
              {capabilities.canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={pending}
                >
                  삭제
                </Button>
              )}
              {capabilities.canReport && (
                <ReportDialog
                  target="post"
                  targetId={post.id}
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      신고
                    </Button>
                  }
                />
              )}
              {capabilities.canModerate && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleModeratorDelete}
                  disabled={pending}
                >
                  관리 삭제
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* 이벤트 정보 — 일시·장소·D-day */}
      {post.event &&
        (() => {
          const dday = formatDday(post.event.startsAt, post.event.endsAt);
          return (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                    dday.state === "ended"
                      ? "bg-muted text-muted-foreground"
                      : dday.state === "ongoing"
                        ? "bg-emerald-500 text-white"
                        : "bg-primary text-primary-foreground",
                  )}
                >
                  <CalendarClock aria-hidden className="h-3.5 w-3.5" />
                  {dday.label}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {formatKstDateTime(post.event.startsAt)}
                  {post.event.endsAt && ` ~ ${formatKstDateTime(post.event.endsAt)}`}
                </span>
              </div>
              {post.event.place && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin aria-hidden className="h-4 w-4" />
                  {post.event.place}
                </p>
              )}
            </div>
          );
        })()}

      {/* plain text 렌더 — rich text 미지원 */}
      <div className="whitespace-pre-wrap break-words leading-relaxed">
        {post.body}
      </div>

      {/* 외부 링크 — http(s)만, 새 탭·noopener */}
      {post.link && (
        <a
          href={post.link.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card transition-colors hover:border-primary/40"
        >
          <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate">
            <span className="font-medium text-foreground">
              {post.link.label ?? "링크 열기"}
            </span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {(() => {
                try {
                  return new URL(post.link.url).hostname;
                } catch {
                  return post.link.url;
                }
              })()}
            </span>
          </span>
        </a>
      )}

      {/* 첨부 토레카 — 이미지·이름·일본 시세(참고) */}
      {post.card && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
          <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-md border border-border bg-muted">
            {post.card.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.card.imageUrl}
                alt={post.card.name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">이 글이 다루는 토레카</p>
            <p className="truncate font-semibold text-foreground">{post.card.name}</p>
            {post.card.marketAvgJpy > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                일본 시세 평균 ≈ ¥{post.card.marketAvgJpy.toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {view.photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {view.photos.map((photo) => (
            /* 서명 GET URL 직접 서빙 — next/image 최적화 캐시가 15분 TTL 계약을 깨므로 금지(§결정 8) */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.url}
              alt=""
              loading="lazy"
              className="w-full rounded-md border border-border object-cover"
            />
          ))}
        </div>
      )}

      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-lg font-semibold">댓글 {post.commentCount}</h2>
        <CommentThread postId={post.id} comments={comments} />
        {isLoggedIn ? (
          <CommentForm postId={post.id} />
        ) : (
          <p className="rounded-md border border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
            <Link
              href={loginRequiredHref("post")}
              className="font-medium text-foreground hover:underline"
            >
              로그인
            </Link>{" "}
            후 댓글을 작성할 수 있습니다
          </p>
        )}
      </section>

      {capabilities.canDelete && (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>글 삭제</DialogTitle>
              <DialogDescription>
                글 &quot;{post.title}&quot;을 삭제하시겠습니까? 삭제 후에는
                되돌릴 수 없습니다.
              </DialogDescription>
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
    </article>
  );
}
