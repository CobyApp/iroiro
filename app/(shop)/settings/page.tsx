import { redirect } from "next/navigation";

// 설정은 마이페이지(/mypage)로 통합됨 — 테마·계정 관리는 모두 마이페이지에서.
// 기존 링크·북마크 보존용 리다이렉트.
export default function SettingsRedirect() {
  redirect("/mypage");
}
