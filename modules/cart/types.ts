// 장바구니 항목(원본). 상품 정보(이름·가격·재고·썸네일)는 이 도메인에 두지 않고
// 호출 측(페이지)에서 products 도메인과 합성한다 — cart는 products lib에 의존하지 않는다.
export type CartItem = {
  id: number;
  accountId: string;
  productId: number;
  quantity: number;
  createdAt: string;
  updatedAt: string;
};
