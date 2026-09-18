"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createBanner,
  uploadBannerImageFile,
  updateBanner,
} from "@/modules/banners/actions";
import type { Banner } from "@/modules/banners/types";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

// 배너 생성/수정 폼 — 이미지 R2 업로드 + 링크 + 게시기간 + 정렬 순서.
export function BannerForm({
  mode,
  banner,
  initialImageUrl,
}: {
  mode: "new" | "edit";
  banner?: Banner;
  initialImageUrl?: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(banner?.title ?? "");
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? "");
  const [startsAt, setStartsAt] = useState(banner?.startsAt?.slice(0, 10) ?? "");
  const [endsAt, setEndsAt] = useState(banner?.endsAt?.slice(0, 10) ?? "");
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [imageKey, setImageKey] = useState(banner?.imageKey ?? "");
  const [preview, setPreview] = useState<string | null>(
    initialImageUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);

  function handleFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      toast.error("PNG·JPG·WEBP 이미지만 가능합니다.");
      return;
    }
    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    (async () => {
      try {
        // 서버 경유 업로드 — R2 버킷 CORS 미설정으로 직접 PUT은 차단된다.
        const formData = new FormData();
        formData.set("file", file, file.name);
        const { key } = await uploadBannerImageFile(formData);
        setImageKey(key);
        setPreview(localUrl);
        toast.success("이미지를 업로드했습니다.");
      } catch {
        toast.error("이미지 업로드에 실패했습니다.");
      } finally {
        setUploading(false);
      }
    })();
  }

  function handleSubmit() {
    if (!title.trim()) return toast.info("제목을 입력해 주세요.");
    if (!imageKey) return toast.info("배너 이미지를 업로드해 주세요.");
    if (!linkUrl.trim()) return toast.info("링크 URL을 입력해 주세요.");
    startTransition(async () => {
      try {
        const payload = { title, imageKey, linkUrl, startsAt, endsAt, sortOrder };
        if (mode === "edit" && banner) {
          await updateBanner({ id: banner.id, ...payload });
        } else {
          await createBanner(payload);
        }
        toast.success("저장했습니다.");
        router.push("/admin/banners");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  return (
    <div className="space-y-5">
      <Field label="배너 이미지">
        <div className="space-y-2">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- R2/로컬 미리보기
            <img
              src={preview}
              alt=""
              className="aspect-[16/6] w-full rounded-md border border-border object-cover"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED.join(",")}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "업로드 중…" : preview ? "이미지 변경" : "이미지 업로드"}
          </Button>
        </div>
      </Field>

      <Field label="제목">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="링크 URL">
        <Input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="게시 시작(비우면 무제한)">
          <Input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <Field label="게시 종료(비우면 무제한)">
          <Input
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
      </div>
      <Field label="정렬 순서(작을수록 먼저)">
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Field>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={pending || uploading}>
          {pending ? "저장 중…" : "저장"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/banners")}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
