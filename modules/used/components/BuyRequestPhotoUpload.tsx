"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressImageFile, COMPRESS_PRESET } from "@/lib/photo-client";
import { uploadBuyRequestPhotoFile } from "../buy-actions";

export type UploadedBuyPhoto = { r2Key: string; previewUrl: string };

const MAX = 4;

// 삽니다 참고 이미지 업로드 — 최대 4장, 대표·워터마크 없음(참고용).
export function BuyRequestPhotoUpload({
  photos,
  onChange,
}: {
  photos: UploadedBuyPhoto[];
  onChange: (photos: UploadedBuyPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<{ id: string; url: string }[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX - photos.length - pending.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (list.length === 0) {
      toast.error(`참고 이미지는 최대 ${MAX}장까지 올릴 수 있어요`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const jobs = list.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setPending((prev) => [...prev, ...jobs.map((j) => ({ id: j.id, url: j.url }))]);
    setUploading(true);

    const uploaded: UploadedBuyPhoto[] = [];
    for (const job of jobs) {
      try {
        const blob = await compressImageFile(job.file, COMPRESS_PRESET.listing);
        const formData = new FormData();
        formData.set("file", blob, `${job.file.name.replace(/\.[^.]+$/, "")}.jpg`);
        formData.set("filename", job.file.name);
        const result = await uploadBuyRequestPhotoFile(formData);
        if (!result.ok) throw new Error(result.message);
        uploaded.push({ r2Key: result.data.r2Key, previewUrl: result.data.previewUrl });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "업로드에 실패했어요");
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== job.id));
        URL.revokeObjectURL(job.url);
      }
    }
    if (uploaded.length > 0) onChange([...photos, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {photos.map((photo, index) => (
          <div
            key={photo.r2Key}
            className="group relative aspect-square overflow-hidden rounded-xs border border-border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label="이미지 삭제"
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.id} className="relative aspect-square overflow-hidden rounded-xs border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="h-full w-full object-cover opacity-50" />
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          </div>
        ))}
        {photos.length + pending.length < MAX && (
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
        사고 싶은 아이템의 예시 이미지를 최대 {MAX}장 올릴 수 있어요 (선택).
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
          참고 이미지 올리기
        </Button>
      )}
    </div>
  );
}
