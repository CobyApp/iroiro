import "server-only";

import { db } from "@/lib/db";
import type { NotificationType } from "./notify";

export type NotificationItem = {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function listNotifications(
  accountId: string,
  limit = 15,
): Promise<NotificationItem[]> {
  const rows = await db.notification.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: Number(row.id),
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    link: row.linkPath,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countUnread(accountId: string): Promise<number> {
  return db.notification.count({ where: { accountId, readAt: null } });
}
