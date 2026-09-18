// 토레카 마스터 — 판매물(product/used_listing)이 아닌 카드 원본 데이터.

export const CARD_SOURCES = ["external", "admin", "user"] as const;
export type CardSource = (typeof CARD_SOURCES)[number];

export const CARD_SOURCE_LABEL: Record<CardSource, string> = {
  external: "분석기 동기화",
  admin: "관리자 등록",
  user: "유저 제보",
};

export const CARD_STATUSES = ["active", "pending", "rejected"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  active: "공개",
  pending: "검수 대기",
  rejected: "반려",
};

export type Card = {
  id: number;
  source: CardSource;
  externalId: number | null;
  itemCode: string | null;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  seriesId: number | null;
  name: string;
  description: string | null;
  frontR2Key: string | null;
  backR2Key: string | null;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  marketAvgJpy: number;
  marketMinJpy: number;
  marketMaxJpy: number;
  marketSoldCount: number;
  retailPriceJpy: number;
  /** 포즈 번호 — 같은 (시리즈, 멤버) 내 순번. 분석기 포즈 그룹과 동형. */
  pose: number;
  status: CardStatus;
  submittedByAccountId: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

// 표시용 앞/뒷면 URL — 자체 업로드(R2)가 있으면 우선, 없으면 외부 원본.
export function cardFrontUrl(card: Card, publicBase: string): string | null {
  if (card.frontR2Key) return `${publicBase}/${card.frontR2Key}`;
  return card.frontImageUrl;
}

export function cardBackUrl(card: Card, publicBase: string): string | null {
  if (card.backR2Key) return `${publicBase}/${card.backR2Key}`;
  return card.backImageUrl;
}
