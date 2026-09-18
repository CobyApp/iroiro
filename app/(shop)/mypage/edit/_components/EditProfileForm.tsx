"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/modules/auth/actions";
import { NICKNAME_MAX_LENGTH } from "@/modules/auth/lib/nickname";
import { AvatarUploadField } from "./AvatarUploadField";

// 회원정보 변경 폼 — 프로필 사진 + 닉네임 수정. 이메일·전화는 읽기 전용 표시.
export function EditProfileForm({
  displayName,
  email,
  phoneNumber,
  avatarUrl,
}: {
  displayName: string;
  email: string | null;
  phoneNumber: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nickname, setNickname] = useState(displayName);

  function handleSave() {
    const trimmed = nickname.trim();
    if (!trimmed) {
      toast.info("닉네임을 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      try {
        await updateProfile({ displayName: trimmed });
        toast.success("회원정보를 저장했습니다.");
        router.push("/mypage");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <AvatarUploadField avatarUrl={avatarUrl} displayName={displayName} />
      <div className="space-y-2">
        <label htmlFor="nickname" className="text-sm font-medium">
          닉네임
        </label>
        <Input
          id="nickname"
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="닉네임"
        />
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">이메일</dt>
          <dd>{email ?? "미설정"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">전화번호</dt>
          <dd>{phoneNumber ?? "미설정"}</dd>
        </div>
      </dl>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push("/mypage")}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
