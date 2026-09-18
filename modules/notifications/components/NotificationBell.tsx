import { getCurrentAccount } from "@/modules/auth/dal";
import { countUnread, listNotifications } from "../lib/queries";
import { NotificationBellClient } from "./NotificationBellClient";

// 헤더 알림 벨 — 로그인 시에만 노출. 미읽음 수 + 최근 알림을 서버에서 채워
// 클라이언트 팝오버로 넘긴다.
export async function NotificationBell() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const [unread, items] = await Promise.all([
    countUnread(account.id),
    listNotifications(account.id),
  ]);

  return <NotificationBellClient unread={unread} items={items} />;
}
