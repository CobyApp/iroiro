"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImageFile, COMPRESS_PRESET } from "@/lib/photo-client";
import { uploadUsedPhotoFile } from "../actions";

export type UploadedUsedPhoto = {
  r2Key: string;
  previewUrl: string;
  isPrimary: boolean;
};

// 중고 매물 사진 업로드 — 복수(최대 8장) + 대표사진 지정(기본은 첫 장).
export function UsedPhotoUpload({
  photos,
  onChange,
}: {
  photos: UploadedUsedPhoto[];
  onChange: (photos: UploadedUsedPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // 업로드 중인 로컬 미리보기 — 파일을 고르면 즉시 보여주고(낙관적 UI), 완료되면 실제 사진으로 대체한다.
  // 제출 대상(photos)에는 넣지 않아 미완료 사진이 저장되는 것을 막는다.
  const [pending, setPending] = useState<{ id: string; url: string }[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = 8 - photos.length - pending.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (list.length === 0) {
      toast.error("사진은 최대 8장까지 올릴 수 있어요");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    // 각 파일마다 즉시 로컬 미리보기 추가(낙관적) — 화면이 바로 반응한다.
    const jobs = list.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setPending((prev) => [...prev, ...jobs.map((j) => ({ id: j.id, url: j.url }))]);
    setUploading(true);

    const uploaded: UploadedUsedPhoto[] = [];
    for (const job of jobs) {
      try {
        // 클라이언트에서 먼저 줄여 전송량을 줄인다(서버가 이 결과에 워터마크). 실패 시 원본 전송.
        const blob = await compressImageFile(job.file, COMPRESS_PRESET.listing);
        const formData = new FormData();
        formData.set("file", blob, `${job.file.name.replace(/\.[^.]+$/, "")}.jpg`);
        formData.set("filename", job.file.name);
        const result = await uploadUsedPhotoFile(formData);
        if (!result.ok) throw new Error(result.message);
        uploaded.push({ r2Key: result.data.r2Key, previewUrl: result.data.previewUrl, isPrimary: false });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "업로드에 실패했어요");
      } finally {
        // 이 작업의 대기 미리보기 제거 + objectURL 해제.
        setPending((prev) => prev.filter((p) => p.id !== job.id));
        URL.revokeObjectURL(job.url);
      }
    }

    if (uploaded.length > 0) {
      const next = [...photos, ...uploaded];
      if (!next.some((p) => p.isPrimary) && next.length > 0) {
        next[0] = { ...next[0], isPrimary: true };
      }
      onChange(next);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function setPrimary(index: number) {
    onChange(photos.map((p, i) => ({ ...p, isPrimary: i === index })));
  }

  function remove(index: number) {
    const next = photos.filter((_, i) => i !== index);
    if (next.length > 0 && !next.some((p) => p.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {photos.map((photo, index) => (
          <div
            key={photo.r2Key}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-xs border bg-muted",
              photo.isPrimary ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            {/* 로컬 미리보기 blob URL — next/image 불필요 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.previewUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            {photo.isPrimary && (
              <span className="absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                대표
              </span>
            )}
            {/* 터치 기기는 hover가 없으므로 항상 노출, 마우스 환경에서만 hover/focus 시 표시. */}
            <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/45 px-0.5 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0">
              <button
                type="button"
                onClick={() => setPrimary(index)}
                aria-label="대표 사진으로"
                className="grid h-10 w-10 place-items-center text-white"
              >
                <Star className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label="사진 삭제"
                className="grid h-10 w-10 place-items-center text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {/* 업로드 중인 로컬 미리보기 — 흐리게 + 스피너 */}
        {pending.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-xs border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          </div>
        ))}
        {photos.length + pending.length < 8 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xs border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ImagePlus className="h-5 w-5" />
            <span className="text-[10px]">추가</span>
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        실물 사진 최대 8장 · 첫 장이 대표가 되고, 별 아이콘으로 바꿀 수 있어요.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      {photos.length === 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="gap-1.5"
        >
          <ImagePlus className="h-4 w-4" />
          사진 올리기
        </Button>
      )}
    </div>
  );
}
