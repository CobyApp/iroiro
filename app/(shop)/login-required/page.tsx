import type { Metadata } from "next";
import { Gavel, Images, Mail, MessageCircleMore, PackageCheck, ShoppingBag, UserRound } from "lucide-react";
import { GuestFeatureGate } from "@/modules/auth/components/GuestFeatureGate";
import {
  LOGIN_REQUIRED_FEATURES,
  isLoginRequiredFeature,
} from "@/modules/auth/lib/login-required";

export const metadata: Metadata = { title: "로그인이 필요한 기능" };

const FEATURE_ICONS = {
  wishlist: Images,
  cart: ShoppingBag,
  bid: Gavel,
  checkout: ShoppingBag,
  post: MessageCircleMore,
  profile: UserRound,
  collection: Images,
  orders: PackageCheck,
  messages: Mail,
} as const;

export default async function LoginRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature: rawFeature } = await searchParams;
  const feature = isLoginRequiredFeature(rawFeature) ? rawFeature : "profile";
  const content = LOGIN_REQUIRED_FEATURES[feature];

  return (
    <GuestFeatureGate
      icon={FEATURE_ICONS[feature]}
      title={content.title}
      description={content.description}
      benefits={content.benefits}
      secondaryHref={content.secondaryHref}
      secondaryLabel={content.secondaryLabel}
      loginLabel="로그인하고 계속하기"
    />
  );
}
