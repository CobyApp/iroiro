export const LOGIN_REQUIRED_FEATURES = {
  wishlist: {
    title: "마음에 든 상품을 찜할까요?",
    description:
      "찜 목록은 계정에 저장되어 다른 기기에서도 그대로 이어집니다. 로그인한 뒤 하트를 누르면 안전하게 보관할 수 있어요.",
    benefits: ["관심 상품을 한곳에 모아보기", "다른 기기에서도 찜 목록 이어보기"],
    secondaryHref: "/products",
    secondaryLabel: "상품 계속 보기",
  },
  cart: {
    title: "장바구니에 상품을 담을까요?",
    description:
      "선택한 상품과 수량을 안전하게 보관하고 주문으로 이어가려면 로그인이 필요합니다.",
    benefits: ["선택 상품과 수량 저장", "배송비와 결제 금액 미리 확인"],
    secondaryHref: "/products",
    secondaryLabel: "상품 계속 보기",
  },
  checkout: {
    title: "주문을 시작하기 전에 로그인해주세요",
    description:
      "배송지와 결제 정보가 포함되는 단계라 본인 확인이 필요합니다. 로그인 전에는 결제가 진행되지 않아요.",
    benefits: ["주문 정보 안전하게 보호", "결제·배송 상태 계속 확인"],
    secondaryHref: "/cart",
    secondaryLabel: "장바구니로 돌아가기",
  },
  post: {
    title: "커뮤니티에 이야기를 남겨볼까요?",
    description:
      "글과 댓글의 작성자를 안전하게 구분하기 위해 작성 기능만 로그인이 필요합니다. 글을 읽는 것은 계속 자유롭게 할 수 있어요.",
    benefits: ["새 글과 댓글 작성", "내가 쓴 글 모아보기"],
    secondaryHref: "/posts",
    secondaryLabel: "글 계속 보기",
  },
  profile: {
    title: "내 정보를 안전하게 관리해요",
    description:
      "프로필과 회원정보는 본인만 볼 수 있는 영역이라 로그인 후 이용할 수 있습니다.",
    benefits: ["닉네임과 프로필 사진 관리", "개인정보를 본인에게만 표시"],
    secondaryHref: "/products",
    secondaryLabel: "상품 둘러보기",
  },
  collection: {
    title: "나만의 컬렉션을 관리해볼까요?",
    description:
      "보유 카드와 공개 설정은 계정별로 안전하게 저장됩니다. 공개된 다른 컬렉션은 로그인 없이도 볼 수 있어요.",
    benefits: ["소장 카드 정리와 3D 보기", "공개 링크로 컬렉션 공유"],
    secondaryHref: "/products",
    secondaryLabel: "상품 둘러보기",
  },
  bid: {
    title: "입찰에 참여해볼까요?",
    description:
      "입찰은 낙찰 시 구매 의사로 이어지는 행동이라 본인 확인이 필요합니다. 로그인하면 바로 입찰할 수 있어요.",
    benefits: ["실시간 입찰 참여와 낙찰 알림", "낙찰 시 기한 내 간편 결제"],
    secondaryHref: "/products",
    secondaryLabel: "상품 계속 보기",
  },
  orders: {
    title: "내 주문 정보는 로그인 후 확인할 수 있어요",
    description:
      "결제 금액과 배송 상태가 포함된 개인 정보이므로 본인에게만 안전하게 보여드립니다.",
    benefits: ["주문별 결제 상태 확인", "구매 상품과 배송 정보 확인"],
    secondaryHref: "/orders",
    secondaryLabel: "주문 기능 미리 보기",
  },
  messages: {
    title: "쪽지를 주고받으려면 로그인해주세요",
    description:
      "쪽지는 회원끼리 1:1로 주고받는 개인 대화라 본인 확인이 필요합니다. 로그인하면 판매자·회원에게 바로 문의할 수 있어요.",
    benefits: ["판매자·회원과 1:1 대화", "새 쪽지 도착 알림 확인"],
    secondaryHref: "/used",
    secondaryLabel: "중고거래 둘러보기",
  },
} as const;

export type LoginRequiredFeature = keyof typeof LOGIN_REQUIRED_FEATURES;

export function isLoginRequiredFeature(
  value: string | undefined,
): value is LoginRequiredFeature {
  return value !== undefined && value in LOGIN_REQUIRED_FEATURES;
}

export function loginRequiredHref(feature: LoginRequiredFeature): string {
  return `/login-required?feature=${feature}`;
}
