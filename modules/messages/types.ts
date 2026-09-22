// 유저 간 1:1 쪽지 도메인 타입.

export type MessageThreadSummary = {
  id: number;
  // 상대방(내가 아닌 참여자) 정보
  otherAccountId: string;
  otherName: string;
  lastMessageAt: string;
  lastBody: string | null;
  unread: number;
};

export type MessageItem = {
  id: number;
  senderAccountId: string;
  body: string;
  /** 첨부 이미지 서명 GET URL — 없으면 null. */
  imageUrl: string | null;
  createdAt: string;
  mine: boolean;
};

export type MessageThreadView = {
  id: number;
  otherAccountId: string;
  otherName: string;
  messages: MessageItem[];
};

// pair 정규화 — a < b 사전순으로 두 계정을 정렬해 스레드 유일성 보장.
export function canonicalPair(
  x: string,
  y: string,
): { a: string; b: string } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}
