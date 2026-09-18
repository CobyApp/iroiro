export const NOTICE_CATEGORIES = ["general", "event"] as const;
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

export const NOTICE_CATEGORY_LABELS: Record<NoticeCategory, string> = {
  general: "일반",
  event: "이벤트",
};

export type NoticePhoto = { r2Key: string; url: string };

export type Notice = {
  id: number;
  publicCode: string;
  category: NoticeCategory;
  title: string;
  body: string;
  isPinned: boolean;
  photos: NoticePhoto[];
  createdAt: string;
  updatedAt: string;
};
