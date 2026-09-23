"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ImagePlus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatKstDateTime } from "@/lib/datetime";
import {
  PHOTO_ALLOWED_TYPES,
  UNSUPPORTED_TYPE_MESSAGE,
  putWithRetry,
  reencodeToBlob,
} from "@/lib/photo-client";
import type { MessageItem } from "../types";
import {
  markThreadRead,
  presignMessageImage,
  sendMessageToAccount,
} from "../actions";

type Props = {
  threadId: number;
  otherAccountId: string;
  otherName: string;
  messages: MessageItem[];
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// 모바일(sm 미만) 여부 — useSyncExternalStore로 SSR 안전하게 구독(서버 스냅샷=false).
const MOBILE_MQ = "(max-width: 639px)";
function subscribeMobile(cb: () => void): () => void {
  const mq = window.matchMedia(MOBILE_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_MQ).matches,
    () => false,
  );
}

// 쪽지 대화 화면 — 말풍선 + 하단 입력창(텍스트·이미지 첨부). 진입 시 읽음 처리, 전송 후 새로고침.
export function MessageThreadClient({
  threadId,
  otherAccountId,
  otherName,
  messages,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  // 첨부 대기 이미지 — 재인코딩된 Blob + 미리보기 URL.
  const [attach, setAttach] = useState<{ blob: Blob; previewUrl: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, next: MessageItem) => [...state, next],
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // 모바일은 전체화면(fixed) — 단, PageTransition의 transform 조상이 fixed의 기준이 되어
  // 화면이 깨지므로(빈 화면) document.body로 포탈해 조상 밖에서 렌더한다.
  const useMobileFull = useIsMobile();

  // 모바일 키보드가 열리면 visualViewport 가 줄어드는데, fixed 전체화면은 그대로라 상단이
  // 가려지고 입력창이 키보드 뒤로 숨는다. 컨테이너를 실제 보이는 영역(visualViewport)에 맞춘다.
  useEffect(() => {
    const el = rootRef.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!useMobileFull || !el || !vv) return;
    const apply = () => {
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
      el.style.bottom = "auto";
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      el.style.height = "";
      el.style.top = "";
      el.style.bottom = "";
    };
  }, [useMobileFull]);

  useEffect(() => {
    void markThreadRead({ threadId });
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [optimistic.length]);

  // 첨부 미리보기 URL 정리(메모리 누수 방지).
  useEffect(() => {
    return () => {
      if (attach) URL.revokeObjectURL(attach.previewUrl);
    };
  }, [attach]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
      toast.error(UNSUPPORTED_TYPE_MESSAGE);
      return;
    }
    try {
      // 쪽지 사진은 강하게 압축 — 긴 변 1280px·JPEG q0.62(용량·전송 최소화).
      const blob = await reencodeToBlob(file, 1280, 0.62, "image/jpeg");
      if (blob.size > IMAGE_MAX_BYTES) {
        toast.error("이미지는 5MB 이하여야 해요");
        return;
      }
      if (attach) URL.revokeObjectURL(attach.previewUrl);
      setAttach({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch {
      toast.error("이미지를 처리할 수 없어요");
    }
  }

  function clearAttach() {
    if (attach) URL.revokeObjectURL(attach.previewUrl);
    setAttach(null);
  }

  // 첨부 이미지를 업로드하고 최종 저장용 tmp 키를 돌려준다.
  async function uploadAttach(blob: Blob): Promise<string> {
    const res = await presignMessageImage({
      contentType: blob.type,
      sizeBytes: blob.size,
    });
    if (!res.ok) throw new Error(res.message);
    await putWithRetry(
      (url, b) =>
        fetch(url, {
          method: "PUT",
          headers: { "Content-Type": b.type, "If-None-Match": "*" },
          body: b,
        }).then((r) => ({ status: r.status })),
      res.data.uploadUrl,
      blob,
    );
    return res.data.r2Key;
  }

  function handleSend() {
    const text = body.trim();
    if ((!text && !attach) || pending) return;
    const pendingAttach = attach;
    setBody("");
    setAttach(null);
    startTransition(async () => {
      addOptimistic({
        id: Math.random(),
        senderAccountId: "me",
        body: text,
        imageUrl: pendingAttach?.previewUrl ?? null,
        createdAt: new Date().toISOString(),
        mine: true,
      });
      try {
        const imageKey = pendingAttach
          ? await uploadAttach(pendingAttach.blob)
          : null;
        const res = await sendMessageToAccount({
          toAccountId: otherAccountId,
          body: text,
          imageKey,
        });
        if (!res.ok) {
          toast.error(res.message);
          setBody(text);
          setAttach(pendingAttach);
          return;
        }
        if (pendingAttach) URL.revokeObjectURL(pendingAttach.previewUrl);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "전송에 실패했어요");
        setBody(text);
        setAttach(pendingAttach);
      }
    });
  }

  const tree = (
    <div
      ref={rootRef}
      className={
        useMobileFull
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-card"
          : "flex h-[calc(100vh-12rem)] min-h-80 flex-col overflow-hidden rounded-2xl border border-border bg-card"
      }
    >
      {/* 모바일 전체화면 상단바 — 뒤로가기 + 상대 이름(데스크톱은 페이지 헤더가 담당). */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 pb-2.5 pt-[calc(env(safe-area-inset-top)_+_0.625rem)] sm:hidden">
        <Link
          href="/messages"
          aria-label="쪽지함으로"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {otherName.slice(0, 1)}
        </div>
        <span className="min-w-0 truncate text-base font-bold text-foreground">
          {otherName}
        </span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {optimistic.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            첫 쪽지를 보내 대화를 시작하세요.
          </p>
        ) : (
          optimistic.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex flex-col gap-0.5",
                m.mine ? "items-end" : "items-start",
              )}
            >
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- UGC 서명 URL
                <img
                  src={m.imageUrl}
                  alt="첨부 이미지"
                  className="max-h-64 max-w-[78%] rounded-2xl border border-border object-cover"
                  loading="lazy"
                />
              )}
              {m.body && (
                <div
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                    m.mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground",
                  )}
                >
                  {m.body}
                </div>
              )}
              <span className="px-1 text-[11px] text-muted-foreground">
                {formatKstDateTime(m.createdAt)}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {attach && (
        <div className="flex items-center gap-2 border-t border-border bg-card px-3 pt-3">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기 */}
            <img
              src={attach.previewUrl}
              alt="첨부 미리보기"
              className="h-16 w-16 rounded-lg border border-border object-cover"
            />
            <button
              type="button"
              onClick={clearAttach}
              aria-label="첨부 제거"
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-border bg-card p-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] sm:pb-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPickFile}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => fileRef.current?.click()}
          disabled={pending || !!attach}
          aria-label="사진 첨부"
          className="h-10 w-10 shrink-0 rounded-xl"
        >
          <ImagePlus className="h-5 w-5" />
        </Button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="메시지 입력"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={pending || (body.trim().length === 0 && !attach)}
          aria-label="쪽지 보내기"
          className="h-10 w-10 shrink-0 rounded-xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // 모바일 전체화면은 transform 조상(PageTransition) 밖(body)으로 포탈해야 fixed가 뷰포트 기준이 된다.
  return useMobileFull ? createPortal(tree, document.body) : tree;
}
