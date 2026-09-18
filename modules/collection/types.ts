/** 카드 컬렉션 도메인 DTO 단일 진실 소스. BigInt PK는 경계에서 number로 직렬화. */

// 그리드 카드 1장(민감정보 없음). 등록된 항목만 존재(숨김 개념 없음 — 큐레이션 = 등록/해제).
export type CollectionCard = {
  id: number;
  productId: number;
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  quantity: number;
  sortOrder: number; // 컬렉션 내 노출 순번
  acquiredAt: string; // ISO
};

// 공개 페이지(비로그인 열람) — account_id/public_code→회원 역매핑 정보 없음.
export type PublicCollection = {
  title: string;
  cards: CollectionCard[];
};

// 소유자 관리 뷰.
export type OwnerCollection = {
  id: number;
  publicCode: string;
  title: string;
  isPublic: boolean;
  sortOrder: number;
  cards: CollectionCard[];
};

// 보유 항목 1건(소유자 전용 — 인벤토리 피커에서 등록 후보로 표시).
export type InventoryEntry = {
  productId: number;
  productName: string;
  productThumbnailKey: string | null;
  itemType: string;
  teamId: number | null;
  memberId: number | null;
  quantity: number; // 활성 보유 합계
  acquiredAt: string; // ISO(최초 획득)
};
