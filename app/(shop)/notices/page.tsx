import { redirect } from "next/navigation";

// 공지 목록 페이지는 폐지 — 공식 공지는 커뮤니티 상단으로 통합됐다.
// 기존 링크·북마크 호환을 위해 커뮤니티로 리다이렉트한다(공지 상세는 유지).
export default function NoticesPage() {
  redirect("/posts");
}
