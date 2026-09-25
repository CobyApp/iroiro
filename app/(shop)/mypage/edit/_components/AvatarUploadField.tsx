"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImageFile, COMPRESS_PRESET } from "@/lib/photo-client";
import { presignAvatar, updateAvatar } from "@/modules/auth/actions";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

// 아바타 업로드 필드 — 파일 선택 → presign → R2 PUT → updateAvatar.
export function AvatarUploadField({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();

  function handleFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      toast.error("PNG·JPG·WEBP 이미지만 올릴 수 있어요.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("이미지는 5MB 이하만 가능해요.");
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    startTransition(async () => {
      try {
        // 올리기 전 작게 압축(512px) — 전송량·대기 감소. 실패 시 원본으로 폴백.
        const blob = await compressImageFile(file, COMPRESS_PRESET.avatar);
        const contentType = blob.type || file.type;
        const { uploadUrl, key } = await presignAvatar({ contentType });
        const res = await fetch(uploadUrl, {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": contentType },
        });
        if (!res.ok) throw new Error("업로드에 실패했습니다.");
        await updateAvatar({ key });
        toast.success("프로필 사진을 변경했습니다.");
        router.refresh();
      } catch (error) {
        setPreview(avatarUrl);
        toast.error(
          error instanceof Error ? error.message : "업로드에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span
        className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-lemon font-display text-xl text-ink shadow-card"
        aria-hidden
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2/로컬 미리보기
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "업로드 중…" : "프로필 사진 변경"}
        </Button>
        <p className="text-xs text-muted-foreground">PNG·JPG·WEBP, 5MB 이하</p>
      </div>
    </div>
  );
}
