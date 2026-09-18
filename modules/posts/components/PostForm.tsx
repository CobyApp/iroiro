"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPost, deletePost, updatePost } from "../actions";
import { PostPhotoUploader } from "./PostPhotoUploader";
import {
  PostMetaFields,
  EMPTY_META,
  isoToLocal,
  localToIso,
  type MemberOpt,
  type PostMetaValue,
  type TeamOpt,
} from "./PostMetaFields";
import { revokePreviews, type UploadedPhotoItem } from "../lib/photo-upload-client";
import { PHOTO_RETRY_CODE, POST_BODY_MAX, POST_TITLE_MAX } from "../lib/schema";
import {
  POST_TOPICS,
  POST_TOPIC_EMOJI,
  POST_TOPIC_LABELS,
  type LockedReason,
  type Post,
  type PostTopic,
} from "../types";

type Props = {
  mode: "new" | "edit";
  post?: Post;
  /** 수정 잠금 사유(§11) — moderation(운영 숨김) | has_comments(댓글 존재) | null. */
  lockedReason?: LockedReason;
  teams: TeamOpt[];
  members: MemberOpt[];
  publicBaseUrl: string;
};

function initialMeta(post?: Post): PostMetaValue {
  if (!post) return EMPTY_META;
  return {
    teamId: post.tag.teamId,
    memberId: post.tag.memberId,
    cardId: post.card?.id ?? null,
    card: post.card
      ? { id: post.card.id, name: post.card.name, imageUrl: post.card.imageUrl }
      : null,
    linkUrl: post.link?.url ?? "",
    linkLabel: post.link?.label ?? "",
    eventStartsAt: isoToLocal(post.event?.startsAt ?? null),
    eventEndsAt: isoToLocal(post.event?.endsAt ?? null),
    eventPlace: post.event?.place ?? "",
  };
}

const LOCKED_MESSAGES: Record<Exclude<LockedReason, null>, string> = {
  moderation: "운영 검토 중인 글입니다. 수정할 수 없으며, 삭제만 가능합니다.",
  has_comments: "댓글이 작성된 글은 내용을 수정할 수 없습니다. 삭제는 가능합니다.",
};

export function PostForm({
  mode,
  post,
  lockedReason = null,
  teams,
  members,
  publicBaseUrl,
}: Props) {
  const locked = lockedReason !== null;
  const [photos, setPhotos] = useState<UploadedPhotoItem[]>([]);
  const [meta, setMeta] = useState<PostMetaValue>(() => initialMeta(post));
  // 업로드가 끝나기 전에 등록되면 사진 없는 글·일부만 담긴 글이 만들어진다(P1-4).
  const [uploading, setUploading] = useState(false);
  // 언마운트 시 미리보기 blob URL 해제(P2-3) — ref로 최신 목록을 잡아둔다.
  // 렌더 중 ref 갱신은 금지(react-hooks/refs)라 effect로 동기화한다.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => revokePreviews(photosRef.current), []);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 기본 토픽은 일상글이 많은 '자랑·수다' — 이벤트는 일시 필수라 명시 선택하게 둔다.
  const [topic, setTopic] = useState<PostTopic>(post?.topic ?? "community");
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("제목과 본문을 입력해주세요");
      return;
    }
    // 버튼 비활성만으로는 Enter 제출·상태 반영 직전 경쟁을 막지 못한다(P2-1).
    if (uploading) {
      toast.error("사진 업로드가 끝난 후 등록해주세요");
      return;
    }

    // event 토픽은 시작 일시 필수 — 서버도 재검증하지만 즉시 피드백.
    if (topic === "event" && !meta.eventStartsAt) {
      toast.error("이벤트 시작 일시를 입력해주세요");
      return;
    }
    const metaPayload = {
      teamId: meta.teamId,
      memberId: meta.teamId !== null ? meta.memberId : null,
      cardId: meta.memberId !== null ? meta.cardId : null,
      linkUrl: meta.linkUrl.trim() || null,
      linkLabel: meta.linkLabel.trim() || null,
      eventStartsAt: topic === "event" ? localToIso(meta.eventStartsAt) : null,
      eventEndsAt: topic === "event" ? localToIso(meta.eventEndsAt) : null,
      eventPlace: topic === "event" ? meta.eventPlace.trim() || null : null,
    };

    startTransition(async () => {
      const result =
        mode === "edit" && post
          ? await updatePost({ id: post.id, topic, title, body, ...metaPayload })
          : await createPost({
              topic,
              title,
              body,
              ...metaPayload,
              photos: photos.map((p) => ({ pendingPhotoId: p.pendingPhotoId })),
            });
      if (!result.ok) {
        // 소비된 대기 사진은 복구되지 않는다(§결정 8) — 첨부를 비우고 다시 고르도록 안내한다(P2-3).
        if (result.code === PHOTO_RETRY_CODE) {
          revokePreviews(photos);
          setPhotos([]);
          toast.error(`${result.message} (첨부한 사진이 초기화되었습니다)`);
          return;
        }
        toast.error(result.message);
        return;
      }
      revokePreviews(photos); // 이동 전 미리보기 해제
      router.push(`/posts/${result.data.postPublicCode}`);
    });
  }

  function handleDelete() {
    if (!post) return;
    startDeleteTransition(async () => {
      const result = await deletePost(post.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`글 "${post.title}" 삭제 완료`);
      setConfirmOpen(false);
      router.push("/posts/my");
    });
  }

  const submitLabel = pending
    ? mode === "edit"
      ? "저장 중..."
      : "등록 중..."
    : mode === "edit"
      ? "저장"
      : "등록";
  // 잠긴 글의 취소는 상세(404)가 아니라 내 글로 — 숨김 글은 소유자에게도 상세가 열리지 않는다.
  const cancelHref =
    mode === "edit" && post
      ? lockedReason === "moderation"
        ? "/posts/my"
        : `/posts/${post.publicCode}`
      : "/posts";

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>게시글 내용</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lockedReason !== null && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {LOCKED_MESSAGES[lockedReason]}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="topic">말머리</Label>
            <Select
              value={topic}
              onValueChange={(value) => setTopic(value as PostTopic)}
              disabled={locked}
            >
              <SelectTrigger id="topic" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POST_TOPICS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {POST_TOPIC_EMOJI[value]} {POST_TOPIC_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {topic === "event"
                ? "생일카페·컵홀더·팝업·정모 등 오프라인 행사 — 일시·장소·링크를 남겨주세요."
                : "개봉·컬렉션 자랑, 최애 이야기, 시세·정품 질문 등 자유롭게."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="제목을 입력해주세요"
              maxLength={POST_TITLE_MAX}
              autoFocus
              required
              disabled={locked}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">
              본문 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="본문을 입력해주세요 (plain text)"
              rows={12}
              maxLength={POST_BODY_MAX}
              required
              disabled={locked}
            />
          </div>

          {!locked && (
            <PostMetaFields
              topic={topic}
              value={meta}
              onChange={setMeta}
              teams={teams}
              members={members}
              publicBaseUrl={publicBaseUrl}
              disabled={pending}
            />
          )}

          {mode === "new" && (
            <div className="space-y-2">
              <Label>사진 (선택)</Label>
              <PostPhotoUploader
                items={photos}
                onChange={setPhotos}
                disabled={pending}
                onUploadingChange={setUploading}
              />
            </div>
          )}

          {/* 거래글은 커뮤니티가 아니라 중고거래로 유도(신고 사유에도 '거래 게시물'). */}
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            팔거나 구하는 글은 <b className="text-foreground">중고거래</b> 탭을
            이용해주세요. 커뮤니티는 이벤트·자랑·수다 공간이에요.
          </p>

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === "edit" && post ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={pending || deleting || uploading}
              >
                삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(cancelHref)}
                disabled={pending || deleting || uploading}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={
                  locked || pending || deleting || uploading || !title.trim() || !body.trim()
                }
              >
                {uploading ? "사진 업로드 중..." : submitLabel}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "edit" && post ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>글 삭제</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <p>글 &quot;{post.title}&quot;을 삭제하시겠습니까?</p>
                  <p>삭제 후에는 되돌릴 수 없습니다.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </form>
  );
}
