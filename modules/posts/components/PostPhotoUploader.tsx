"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presignPostPhotos } from "../actions";
import {
  PHOTO_CLIENT_MAX_DIMENSION,
  PHOTO_UPLOAD_TIMEOUT_MS,
  reencodeToBlob,
} from "@/lib/photo-client";
import { PHOTO_MAX_COUNT } from "../lib/schema";
import { preparePhotos, type UploadedPhotoItem } from "../lib/photo-upload-client";

type Props = {
  items: UploadedPhotoItem[];
  onChange: (items: UploadedPhotoItem[]) => void;
  disabled?: boolean;
  /** 업로드 진행 상태를 부모에 알린다 — 폼이 업로드 중 제출을 막기 위해 필요(P1-4). */
  onUploadingChange?: (uploading: boolean) => void;
};

// 글 작성 화면 전용(§11 — 사진은 생성 시에만). accept에 heic 금지(Safari 17+ 역변환 — P2-4).
export function PostPhotoUploader({ items, onChange, disabled = false, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function changeUploading(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    changeUploading(true);
    setErrors([]);
    try {
      const result = await preparePhotos(
        [...fileList],
        {
          existingCount: items.length,
          existingTotalBytes: items.reduce((sum, i) => sum + i.sizeBytes, 0),
        },
        {
          reencode: (file) => reencodeToBlob(file, PHOTO_CLIENT_MAX_DIMENSION),
          presign: (files) => presignPostPhotos({ files }),
          // 멈춘 요청이 uploading을 영구 true로 만들어 등록·취소가 잠기는 것을 막는다(P2-2).
          // timeout은 putWithRetry의 "네트워크 오류" 경로로 흘러 1회 재시도된다.
          put: async (url, blob) => {
            const response = await fetch(url, {
              method: "PUT",
              headers: { "Content-Type": blob.type, "If-None-Match": "*" },
              body: blob,
              signal: AbortSignal.timeout(PHOTO_UPLOAD_TIMEOUT_MS),
            });
            return { status: response.status };
          },
        },
      );
      if (result.items.length > 0) onChange([...items, ...result.items]);
      setErrors(result.errors);
    } catch (error) {
      // presign·PUT의 예상하지 못한 예외도 사용자에게 드러낸다(P1-4) — 무음 실패 금지.
      setErrors([error instanceof Error ? error.message : "사진 업로드 중 오류가 발생했습니다"]);
    } finally {
      changeUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    const next = [...items];
    URL.revokeObjectURL(next[index].previewUrl);
    next.splice(index, 1);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => handleFiles(event.target.files)}
      />
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item, index) => (
            <li key={item.pendingPhotoId} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기 */}
              <img
                src={item.previewUrl}
                alt=""
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  대표
                </span>
              )}
              <button
                type="button"
                aria-label="사진 제거"
                onClick={() => removeAt(index)}
                disabled={disabled || uploading}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || items.length >= PHOTO_MAX_COUNT}
        >
          <ImagePlus aria-hidden className="mr-1 h-4 w-4" />
          {uploading ? "업로드 중..." : `사진 추가 (${items.length}/${PHOTO_MAX_COUNT})`}
        </Button>
        <span className="text-xs text-muted-foreground">
          JPG·PNG·WebP, 장당 5MB · 첫 번째 사진이 대표로 표시됩니다
        </span>
      </div>
      {errors.map((message) => (
        <p key={message} className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
