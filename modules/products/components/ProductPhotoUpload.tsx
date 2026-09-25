"use client";

import { useCallback, useId, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, Maximize2, Star, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compressImageFile, COMPRESS_PRESET } from "@/lib/photo-client";
import { uploadProductPhotoFile } from "../actions";
import type { ProductPhotoInput } from "../lib/schema";
import type { ProductPhoto } from "../types";
import { ProductLightbox } from "./ProductLightbox";

type PendingPhoto = ProductPhotoInput & {
  uiId: string;
  previewUrl: string;
  uploading: boolean;
};

type Props = {
  photos: ProductPhotoInput[];
  onChange: (photos: ProductPhotoInput[]) => void;
  publicBaseUrl: string;
};

export function ProductPhotoUpload({ photos, onChange, publicBaseUrl }: Props) {
  const [pending, setPending] = useState<PendingPhoto[]>(() =>
    photos.map((photo, index) => ({
      ...photo,
      uiId: `existing-${index}`,
      previewUrl: `${publicBaseUrl}/${photo.r2Key}`,
      uploading: false,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor));
  // dnd-kit이 글로벌 카운터로 aria-describedby ID를 생성하면 SSR→hydration
  // 시점에 ID가 어긋나 mismatch 경고가 난다. useId()로 안정적인 ID를 주입.
  const dndId = useId();

  const sync = useCallback(
    (next: PendingPhoto[]) => {
      setPending(next);
      onChange(
        next.map((photo) => ({
          r2Key: photo.r2Key,
          altText: photo.altText ?? null,
          displayOrder: photo.displayOrder,
          isThumbnail: photo.isThumbnail,
        })),
      );
    },
    [onChange],
  );

  const onFiles = useCallback(
    async (fileList: FileList) => {
      setError(null);
      const files = Array.from(fileList);
      if (pending.length + files.length > 10) {
        setError("상품당 최대 10장");
        return;
      }

      // 서버 경유 업로드 — R2 버킷 CORS 미설정으로 직접 PUT은 차단된다.
      // 업로드 완료 후 r2Key가 확정되므로, 자리표시 항목을 먼저 그리고
      // 완료 시 키를 채운다.
      const stamp = Date.now();
      const newItems: PendingPhoto[] = files.map((file, index) => ({
        uiId: `pending-${stamp}-${index}`,
        r2Key: "",
        altText: null,
        displayOrder: pending.length + index,
        isThumbnail: pending.length + index === 0,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
      }));

      sync([...pending, ...newItems]);

      await Promise.all(
        newItems.map(async (item, index) => {
          const file = files[index];

          try {
            // 클라이언트에서 먼저 줄여 전송량을 줄인다(서버가 이 결과에 워터마크). 실패 시 원본 전송.
            const blob = await compressImageFile(file, COMPRESS_PRESET.listing);
            const formData = new FormData();
            formData.set("file", blob, `${file.name.replace(/\.[^.]+$/, "")}.jpg`);
            formData.set("filename", file.name);
            const result = await uploadProductPhotoFile(formData);
            if (!result.ok) throw new Error(result.message);
            // 업로드 완료 → 자리표시(원본 blob) 대신 서버가 압축해 저장한 실제 객체를 미리보기로.
            URL.revokeObjectURL(item.previewUrl);
            setPending((previous) =>
              previous.map((photo) =>
                photo.uiId === item.uiId
                  ? {
                      ...photo,
                      r2Key: result.data.r2Key,
                      previewUrl: result.data.previewUrl,
                      uploading: false,
                    }
                  : photo,
              ),
            );
          } catch (uploadError) {
            setPending((previous) =>
              previous.filter((photo) => photo.uiId !== item.uiId),
            );
            setError(
              `업로드 실패: ${file.name} (${
                uploadError instanceof Error ? uploadError.message : ""
              })`,
            );
          }
        }),
      );
    },
    [pending, sync],
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pending.findIndex((photo) => photo.uiId === active.id);
    const newIndex = pending.findIndex((photo) => photo.uiId === over.id);
    const reordered = arrayMove(pending, oldIndex, newIndex).map(
      (photo, index) => ({
        ...photo,
        displayOrder: index,
      }),
    );
    sync(reordered);
  }

  function remove(uiId: string) {
    const filtered = pending.filter((photo) => photo.uiId !== uiId);
    const hasThumbnail = filtered.some((photo) => photo.isThumbnail);
    sync(
      filtered.map((photo, index) => ({
        ...photo,
        displayOrder: index,
        isThumbnail: hasThumbnail ? photo.isThumbnail : index === 0,
      })),
    );
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="photo-input"
        className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length) void onFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          파일 끌어 놓기 또는 클릭하여 선택 (최대 10장 / 5MB)
        </span>
        <input
          id="photo-input"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void onFiles(event.target.files);
          }}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={pending.map((photo) => photo.uiId)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pending.map((photo, index) => (
              <PhotoCard
                key={photo.uiId}
                photo={photo}
                onToggleThumb={() =>
                  sync(
                    pending.map((item) => ({
                      ...item,
                      isThumbnail: item.uiId === photo.uiId,
                    })),
                  )
                }
                onRemove={() => remove(photo.uiId)}
                onAltChange={(alt) =>
                  sync(
                    pending.map((item) =>
                      item.uiId === photo.uiId
                        ? { ...item, altText: alt || null }
                        : item,
                    ),
                  )
                }
                onEnlarge={
                  photo.uploading ? undefined : () => setLightboxIndex(index)
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {lightboxIndex !== null && (
        <ProductLightbox
          photos={pending.map(
            (item, index): ProductPhoto => ({
              id: index,
              productId: 0,
              r2Key: item.r2Key,
              altText: item.altText ?? null,
              displayOrder: item.displayOrder,
              isThumbnail: item.isThumbnail,
              createdAt: "",
            }),
          )}
          publicBaseUrl={publicBaseUrl}
          altFallback="업로드 사진 미리보기"
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          getSrc={(_, index) => pending[index]?.previewUrl ?? ""}
        />
      )}
    </div>
  );
}

function PhotoCard({
  photo,
  onToggleThumb,
  onRemove,
  onAltChange,
  onEnlarge,
}: {
  photo: PendingPhoto;
  onToggleThumb: () => void;
  onRemove: () => void;
  onAltChange: (alt: string) => void;
  onEnlarge?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: photo.uiId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative rounded-sm border border-border bg-card p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="드래그하여 순서 변경"
        className="absolute right-1 top-1 z-10 flex h-7 w-7 cursor-grab items-center justify-center rounded-xs bg-card/80 text-muted-foreground backdrop-blur hover:bg-card focus:outline-none focus:ring-2 focus:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onEnlarge}
        disabled={!onEnlarge}
        aria-label="크게 보기"
        className="group relative block aspect-square w-full overflow-hidden rounded-xs disabled:cursor-default"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl}
          alt={photo.altText ?? ""}
          className="h-full w-full object-cover"
          draggable={false}
        />
        {photo.uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
            <Maximize2 className="h-6 w-6 text-white" />
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center gap-1">
        <Button
          type="button"
          variant={photo.isThumbnail ? "default" : "outline"}
          size="icon"
          onClick={onToggleThumb}
          aria-label="대표 사진 지정"
        >
          <Star className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onRemove}
          aria-label="삭제"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Input
        value={photo.altText ?? ""}
        onChange={(event) => onAltChange(event.target.value)}
        placeholder="alt text"
        className="mt-2 text-xs"
      />
    </div>
  );
}
