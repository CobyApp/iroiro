import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
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
    <div className="shop-page-frame space-y-4">
      <ShopPageHeader
        eyebrow="MESSAGES"
        title={thread.otherName}
        description="1:1 쪽지 대화"
      />
      <MessageThreadClient
        threadId={thread.id}
        otherAccountId={thread.otherAccountId}
        messages={thread.messages}
      />
    </div>
  );
}
