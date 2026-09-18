"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatKstDateTime } from "@/lib/datetime";
import type { MessageItem } from "../types";
import { markThreadRead, sendMessageToAccount } from "../actions";

type Props = {
  threadId: number;
  otherAccountId: string;
  messages: MessageItem[];
};

// 쪽지 대화 화면 — 말풍선 + 하단 입력창. 진입 시 읽음 처리, 전송 후 새로고침.
export function MessageThreadClient({
  threadId,
  otherAccountId,
  messages,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, next: MessageItem) => [...state, next],
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // 진입 시 읽음 처리(뱃지 정리).
  useEffect(() => {
    void markThreadRead({ threadId });
  }, [threadId]);

  // 새 메시지 오면 맨 아래로.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [optimistic.length]);

  function handleSend() {
    const text = body.trim();
    if (!text || pending) return;
    setBody("");
    startTransition(async () => {
      addOptimistic({
        id: Math.random(),
        senderAccountId: "me",
        body: text,
        createdAt: new Date().toISOString(),
        mine: true,
      });
      const res = await sendMessageToAccount({
        toAccountId: otherAccountId,
        body: text,
      });
      if (!res.ok) {
        toast.error(res.message);
        setBody(text);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card">
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
              <span className="px-1 text-[11px] text-muted-foreground">
                {formatKstDateTime(m.createdAt)}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border bg-card p-3">
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
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={pending || body.trim().length === 0}
          aria-label="쪽지 보내기"
          className="h-10 w-10 shrink-0 rounded-xl"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
