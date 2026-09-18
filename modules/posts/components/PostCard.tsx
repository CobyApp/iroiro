import Link from "next/link";
import {
  CalendarClock,
  Image as ImageIcon,
  LinkIcon,
  MapPin,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDday, formatKstDateTime, formatKstRelative } from "@/lib/datetime";
import { POST_TOPIC_EMOJI, POST_TOPIC_LABELS, type Post } from "../types";

type Props = { post: Post };

// 최애 태그 칩 — 그룹/멤버가 있으면.
function FaveChip({ post }: { post: Post }) {
  const label = post.tag.memberName ?? post.tag.teamName;
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      <Sparkles aria-hidden className="h-3 w-3" />
      {label}
    </span>
  );
}

function MetaCounts({ post }: { post: Post }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
      {post.photoCount > 0 && (
        <span className="flex items-center gap-0.5">
          <ImageIcon aria-hidden className="h-3.5 w-3.5" />
          {post.photoCount}
        </span>
      )}
      {post.link && <LinkIcon aria-hidden className="h-3.5 w-3.5" />}
      <span className="flex items-center gap-0.5">
        <MessageSquare aria-hidden className="h-3.5 w-3.5" />
        {post.commentCount}
      </span>
    </span>
  );
}

export function PostCard({ post }: Props) {
  const isEvent = post.topic === "event" && post.event !== null;
  const dday = isEvent ? formatDday(post.event!.startsAt, post.event!.endsAt) : null;

  return (
    <Link
      href={`/posts/${post.publicCode}`}
      className={cn(
        "group flex gap-3 rounded-xl border border-border bg-card p-3 shadow-card transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40",
        dday?.state === "ended" && "opacity-65",
      )}
    >
      {post.thumbnailUrl && (
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {isEvent && dday && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
                dday.state === "ended"
                  ? "bg-muted text-muted-foreground"
                  : dday.state === "ongoing"
                    ? "bg-emerald-500 text-white"
                    : "bg-primary text-primary-foreground",
              )}
            >
              <CalendarClock aria-hidden className="h-3 w-3" />
              {dday.label}
            </span>
          )}
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {POST_TOPIC_EMOJI[post.topic]} {POST_TOPIC_LABELS[post.topic]}
          </span>
          <FaveChip post={post} />
        </div>

        <p className="line-clamp-1 font-semibold text-foreground">{post.title}</p>

        {/* 이벤트는 일시·장소를, 커뮤니티는 본문 한 줄을 미리 보여준다. */}
        {isEvent ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{formatKstDateTime(post.event!.startsAt)}</span>
            {post.event!.place && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin aria-hidden className="h-3 w-3" />
                {post.event!.place}
              </span>
            )}
          </p>
        ) : (
          <p className="line-clamp-1 text-xs text-muted-foreground">{post.body}</p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className="truncate text-xs text-muted-foreground">
            {post.authorName}
            {post.editedAt && " · 수정됨"}
            {" · "}
            {formatKstRelative(post.createdAt)}
          </span>
          <MetaCounts post={post} />
        </div>
      </div>
    </Link>
  );
}
