import { cardCleanKey } from "./lib/image-keys";

// 토레카 마스터 — 판매물(product/used_listing)이 아닌 카드 원본 데이터.
// 앞면 이미지 하나만 보관한다(자체 R2). 출처·시세 같은 외부 연동 필드는 두지 않는다 —
// 유저 제보 여부는 submittedByAccountId 유무로, 공개 여부는 status 로 판별한다.

export const CARD_STATUSES = ["active", "pending", "rejected"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  active: "공개",
  pending: "검수 대기",
  rejected: "반려",
};

export type Card = {
  id: number;
  itemCode: string | null;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  seriesId: number | null;
  name: string;
  description: string | null;
  /** 앞면 이미지 키(카탈로그 버킷 cards/wm/…, 63:88 정규화·워터마크). clean 원본은 규약으로 파생. 없으면 이미지 없는 카드. */
  frontR2Key: string | null;
  retailPriceJpy: number;
  /** 포즈 번호 — 같은 (시리즈, 멤버) 내 순번. */
  pose: number;
  status: CardStatus;
  /** 유저 제보면 제보자 계정 id, 관리자 등록이면 null. */
  submittedByAccountId: string | null;
  reviewNote: string | null;
  /** 이미지 분석에 쓴 모델·버전. 미분석이면 null. (임베딩 벡터 자체는 클라이언트로 보내지 않는다.) */
  analysisModel: string | null;
  /** 이미지 분석 완료 시각(ISO). 미분석이면 null. */
  analyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// 표시용 앞면 URL(공개·워터마크) — 고객 화면. publicBase 는 카탈로그 버킷 공개 베이스(CATALOG_PUBLIC_BASE).
export function cardFrontUrl(
  card: Pick<Card, "frontR2Key">,
  publicBase: string,
): string | null {
  return card.frontR2Key ? `${publicBase}/${card.frontR2Key}` : null;
}

// 어느 벌을 보여줄지 — 고객 화면은 공개 wm 객체 URL, 관리자(카탈로그) 화면은 clean 원본을
// 서버 라우트(/media/catalog-clean, site admin 가드)로 프록시한다.
export type CardImageView =
  | { kind: "public"; publicBase: string }
  | { kind: "admin" };

export const CATALOG_CLEAN_MEDIA_PATH = "/media/catalog-clean";

export function cardImageSrc(
  card: Pick<Card, "frontR2Key">,
  view: CardImageView,
): string | null {
  if (!card.frontR2Key) return null;
  if (view.kind === "public") return `${view.publicBase}/${card.frontR2Key}`;
  const clean = cardCleanKey(card.frontR2Key);
  // clean 이 없는 예전 키는 관리자도 wm 을 라우트 경유로 본다(라우트가 폴백).
  return `${CATALOG_CLEAN_MEDIA_PATH}/${clean ?? card.frontR2Key}`;
}

// 유저 제보 카드인가(관리자 직접 등록이 아닌가).
export function isUserSubmitted(card: Pick<Card, "submittedByAccountId">): boolean {
  return card.submittedByAccountId !== null;
}
