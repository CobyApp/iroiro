"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoginPromptDialog } from "@/modules/auth/components/LoginPromptDialog";
import { sendMessageToAccount, sendMessageToPostAuthor } from "../actions";

type Props = {
  // 대상 지정 — 계정 직접(중고 판매자) 또는 게시글 publicCode(작성자).
  toAccountId?: string;
  postPublicCode?: string;
  toName: string;
  isLoggedIn: boolean;
  // 대화 시작 맥락 — 첫 메시지 초안에 채워 넣는다(선택).
  contextLabel?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
};

// "쪽지하기" 진입 버튼 — 로그인 시 다이얼로그로 첫 메시지 작성 후 스레드로 이동.
export function MessageUserButton({
  toAccountId,
  postPublicCode,
  toName,
  isLoggedIn,
  contextLabel,
  variant = "outline",
  size = "default",
  className,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [body, setBody] = useState(
    contextLabel ? `[${contextLabel}] 관련 문의드립니다.\n` : "",
  );
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <>
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={() => setLoginOpen(true)}
        >
          <Mail className="h-4 w-4" />
          쪽지하기
        </Button>
        <LoginPromptDialog
          feature="messages"
          open={loginOpen}
          onOpenChange={setLoginOpen}
        />
      </>
    );
  }

  function handleSend() {
    const text = body.trim();
    if (!text || pending) return;
    startTransition(async () => {
      const res = postPublicCode
        ? await sendMessageToPostAuthor({ postPublicCode, body: text })
        : await sendMessageToAccount({ toAccountId: toAccountId!, body: text });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setOpen(false);
      router.push(`/messages/${res.data.threadId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Mail className="h-4 w-4" />
          쪽지하기
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{toName}님에게 쪽지</DialogTitle>
          <DialogDescription>
            1:1 쪽지로 전달됩니다. 상대가 답장하면 쪽지함에서 이어집니다.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="메시지를 입력하세요"
          autoFocus
        />
        <DialogFooter>
          <Button
            type="button"
            onClick={handleSend}
            disabled={pending || body.trim().length === 0}
          >
            <Mail className="h-4 w-4" />
            보내기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
