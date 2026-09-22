import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPublicUrl } from "@/lib/r2/presign";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { EditProfileForm } from "./_components/EditProfileForm";

export const metadata: Metadata = { title: "회원정보 변경" };

// 회원정보 변경 — 닉네임 수정(이메일·전화 읽기 전용).
export default async function EditProfilePage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("profile"));

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        eyebrow="PROFILE SETTINGS"
        title="프로필 편집"
        description="이로이로에서 표시될 이름과 프로필 사진을 관리하세요."
      />
      <section className="shop-content-surface">
        <EditProfileForm
          displayName={account.displayName ?? ""}
          email={account.email}
          phoneNumber={account.phoneNumber}
          avatarUrl={account.avatarKey ? getPublicUrl(account.avatarKey) : null}
        />
      </section>

    </div>
  );
}
