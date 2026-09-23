import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { getThreadForViewer } from "@/modules/messages/lib/queries";
import { MessageThreadClient } from "@/modules/messages/components/MessageThreadClient";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const account = await getCurrentAccount();
  if (!account) return { title: "쪽지" };
  const thread = await getThreadForViewer(Number(id) || 0, account.id);
  return { title: thread ? `${thread.otherName}님과의 쪽지` : "쪽지" };
}

export default async function MessageThreadPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const threadId = Number(id);
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("messages"));
  if (!Number.isInteger(threadId) || threadId <= 0) notFound();

  const thread = await getThreadForViewer(threadId, account.id);
  if (!thread) notFound();

  return (
    <div className="shop-page-frame space-y-3">
      {/* 모바일 채팅 공간 확보 — 무거운 페이지 헤더 대신 상대 이름만 한 줄로.
         뒤로가기는 상단 쇼핑 헤더가 이미 제공한다(HeaderLeading). */}
      <div className="flex items-center gap-2.5">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {thread.otherName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-foreground">
            {thread.otherName}
          </h1>
          <p className="text-[11px] text-muted-foreground">1:1 쪽지</p>
        </div>
      </div>
      <MessageThreadClient
        threadId={thread.id}
        otherAccountId={thread.otherAccountId}
        messages={thread.messages}
      />
    </div>
  );
}
