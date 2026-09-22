import {
  Compass,
  Heart,
  MessageSquare,
  Repeat,
  User,
  type LucideIcon,
} from "lucide-react";
import type { TabKey } from "./mobile-tabs";

// 데스크톱 헤더와 모바일 탭바가 같은 탐색 아이콘을 사용한다.
export const SHOP_NAVIGATION_ICONS: Record<TabKey, LucideIcon> = {
  discover: Compass,
  used: Repeat,
  wishlist: Heart,
  community: MessageSquare,
  mypage: User,
};
