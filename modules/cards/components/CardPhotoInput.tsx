"use client";

import { useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeCardImage } from "../lib/normalize-image";
import { uploadCardPhoto } from "../actions";

export type UploadedCardPhoto = { r2Key: string; previewUrl: string };

// 앞/뒷면 한 칸 — 선택 즉시 63:88 정규화(사전 축소) → 서버 업로드(서버가 최종 정규화) → 저장된 객체를 미리보기로 표시.
// PhotoScan으로 평평하게 스캔한 사진일수록 정규화 결과가 좋다.
export function CardPhotoInput({
  label,
  required = false,
  value,
  onChange,
  existingUrl = null,
}: {
  label: string;
  required?: boolean;
  value: UploadedCardPhoto | null;
  onChange: (photo: UploadedCardPhoto | null) => void;
  /** 수정 화면에서 기존 이미지 미리보기(교체 전). */
  existingUrl?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const normalized = await normalizeCardImage(file);
      const formData = new FormData();
      formData.set("file", normalized, "card.jpg");
      formData.set("side", label === "앞면" ? "front" : "back");
      const result = await uploadCardPhoto(formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      // 미리보기는 서버가 정규화해 저장한 실제 객체를 보여준다(브라우저 결과물이 아님).
      if (value?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(value.previewUrl);
      onChange({
        r2Key: result.data.r2Key,
        previewUrl: result.data.previewUrl,
      });
    } catch {
      toast.error("이미지를 처리할 수 없어요 — 다른 사진으로 시도해주세요");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const preview = value?.previewUrl ?? existingUrl;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "relative block aspect-[63/88] w-full overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary/50 disabled:opacity-60",
          preview && "border-solid",
        )}
        aria-label={`${label} 이미지 ${preview ? "교체" : "올리기"}`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={`${label} 미리보기`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center">
            <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs">{busy ? "처리 중…" : "사진 올리기"}</span>
            </span>
          </span>
        )}
        {preview && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 py-1 text-[11px] text-white">
            <RotateCcw className="h-3 w-3" />
            눌러서 교체
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
