import { redirect } from "next/navigation";

// 설정은 마이페이지(/mypage)로 통합됨. 기존 링크 보존용 리다이렉트.
export default function MypageSettingsRedirect() {
  redirect("/mypage");
}
