"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  HEIC_TYPES,
  PHOTO_ALLOWED_TYPES,
  PHOTO_CLIENT_MAX_DIMENSION,
  UNSUPPORTED_TYPE_MESSAGE,
  reencodeToBlob,
} from "@/lib/photo-client";
import { uploadNoticePhotoFile } from "../actions";
import { NOTICE_PHOTO_MAX_COUNT, NOTICE_PHOTO_MAX_FILE_BYTES } from "../lib/schema";

export type NoticePhotoItem = { r2Key: string; previewUrl: string };

type Props = {
  items: NoticePhotoItem[];
  onChange: (items: NoticePhotoItem[]) => void;
  disabled?: boolean;
  /** 업로드 중 폼 제출을 막기 위해 부모에 알린다 (posts P1-4 선례). */
  onUploadingChange?: (uploading: boolean) => void;
};

// admin 공지 첨부 전용 — 상품과 동일한 "첨부 즉시 업로드" 흐름. accept에 heic 금지(P2-4).
export function NoticePhotoUploader({ items, onChange, disabled = false, onUploadingChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function changeUploading(next: boolean) {
    setUploading(next);
    onUploadingChange?.(next);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = [...fileList];
    changeUploading(true);
    setErrors([]);
    const nextErrors: string[] = [];
    try {
      // ① 재인코딩 → 최종 Blob 확정 (파일 단위 실패는 수집하고 계속)
      const blobs: { name: string; blob: Blob }[] = [];
      for (const file of files) {
        if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
          if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
          nextErrors.push(`${file.name}: ${UNSUPPORTED_TYPE_MESSAGE}`);
          continue;
        }
        try {
          const blob = await reencodeToBlob(file, PHOTO_CLIENT_MAX_DIMENSION);
          if (blob.size > NOTICE_PHOTO_MAX_FILE_BYTES) {
            nextErrors.push(`${file.name}: 사진은 파일당 5MB 이하여야 합니다`);
            continue;
          }
          blobs.push({ name: file.name, blob });
        } catch {
          if (HEIC_TYPES.includes(file.type)) console.warn("[heic-reject]", file.type);
          nextErrors.push(`${file.name}: 이미지를 처리할 수 없습니다`);
        }
      }
      if (blobs.length === 0) return;

      // 장수 상한은 유효 파일 확정 *후*에 센다 — 거부될 파일까지 세면 들어갈 수 있는 사진까지 막힌다.
      // 에러는 setErrors가 아니라 nextErrors로 — return이 finally를 타므로 여기서 setErrors하면
      // finally의 setErrors(nextErrors)가 같은 tick에 덮어써 무음 실패가 된다.
      if (items.length + blobs.length > NOTICE_PHOTO_MAX_COUNT) {
        nextErrors.push(`사진은 최대 ${NOTICE_PHOTO_MAX_COUNT}장까지 첨부할 수 있습니다`);
        return;
      }

      // ② 서버 경유 업로드 — R2 버킷 CORS 미설정으로 직접 PUT은 차단된다.
      //    실패 항목만 제외하고 성공분을 목록에 추가.
      const added: NoticePhotoItem[] = [];
      for (const { name, blob } of blobs) {
        try {
          const formData = new FormData();
          formData.set("file", blob, name);
          formData.set("filename", name);
          const result = await uploadNoticePhotoFile(formData);
          if (!result.ok) throw new Error(result.message);
          added.push({
            r2Key: result.data.r2Key,
            previewUrl: URL.createObjectURL(blob),
          });
        } catch (error) {
          nextErrors.push(error instanceof Error ? error.message : "사진 업로드에 실패했습니다");
        }
      }
      if (added.length > 0) onChange([...items, ...added]);
    } catch (error) {
      // 예상하지 못한 예외도 드러낸다 — 무음 실패 금지 (posts P1-4 선례)
      nextErrors.push(error instanceof Error ? error.message : "사진 업로드 중 오류가 발생했습니다");
    } finally {
      setErrors(nextErrors);
      changeUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    const next = [...items];
    // 기존 사진(공개 URL)은 revoke 대상이 아니다 — 신규 업로드의 blob URL만 해제
    if (next[index].previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(next[index].previewUrl);
    }
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
        <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:grid-cols-5">
          {items.map((item, index) => (
            <li key={item.r2Key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob 미리보기·R2 공개 URL */}
              <img
                src={item.previewUrl}
                alt=""
                className="aspect-square w-full rounded-md border border-border object-cover"
              />
              <button
                type="button"
                aria-label="사진 제거"
                onClick={() => removeAt(index)}
                disabled={disabled || uploading}
                className="absolute right-0 top-0 grid h-10 w-10 place-items-center text-white"
              >
                {/* 40px 터치 영역 안에 24px 원형 배지 — 시각 크기는 유지하고 탭 영역만 넓힌다. */}
                <span className="grid h-6 w-6 place-items-center rounded-full bg-black/60">
                  <X className="h-3.5 w-3.5" />
                </span>
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
          disabled={disabled || uploading || items.length >= NOTICE_PHOTO_MAX_COUNT}
        >
          <ImagePlus aria-hidden className="mr-1 h-4 w-4" />
          {uploading ? "업로드 중..." : `사진 추가 (${items.length}/${NOTICE_PHOTO_MAX_COUNT})`}
        </Button>
        <span className="text-xs text-muted-foreground">JPG·PNG·WebP, 장당 5MB</span>
      </div>
      {errors.map((message) => (
        <p key={message} className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
