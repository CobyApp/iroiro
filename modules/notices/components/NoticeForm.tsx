"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createNotice, deleteNotice, updateNotice } from "../actions";
import { NoticePhotoUploader, type NoticePhotoItem } from "./NoticePhotoUploader";
import { NOTICE_PHOTO_MAX_COUNT, NOTICE_PIN_LIMIT } from "../lib/schema";
import {
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABELS,
  type Notice,
  type NoticeCategory,
} from "../types";

type Props = {
  mode: "new" | "edit";
  notice?: Notice;
};

export function NoticeForm({ mode, notice }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleteTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [category, setCategory] = useState<NoticeCategory>(
    notice?.category ?? "general",
  );
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [isPinned, setIsPinned] = useState(notice?.isPinned ?? false);
  const [photos, setPhotos] = useState<NoticePhotoItem[]>(
    notice?.photos.map((photo) => ({ r2Key: photo.r2Key, previewUrl: photo.url })) ?? [],
  );
  const [photoUploading, setPhotoUploading] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("제목과 본문을 입력해주세요");
      return;
    }

    startTransition(async () => {
      const payload = { category, title, body, isPinned, photos: photos.map((photo) => photo.r2Key) };
      const result =
        mode === "edit" && notice
          ? await updateNotice({ id: notice.id, ...payload })
          : await createNotice(payload);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.push("/admin/notices");
    });
  }

  function handleDelete() {
    if (!notice) return;
    startDeleteTransition(async () => {
      const result = await deleteNotice(notice.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`공지 "${notice.title}" 삭제 완료`);
      setConfirmOpen(false);
      router.push("/admin/notices");
    });
  }

  const submitLabel = pending
    ? mode === "edit"
      ? "저장 중..."
      : "등록 중..."
    : mode === "edit"
      ? "저장"
      : "등록";

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>공지 내용</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">카테고리</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as NoticeCategory)}
            >
              <SelectTrigger id="category" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_CATEGORIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {NOTICE_CATEGORY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 배송 지연 안내"
              maxLength={100}
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">
              본문 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="공지 본문 (plain text)"
              rows={12}
              maxLength={10000}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>사진 (선택, 최대 {NOTICE_PHOTO_MAX_COUNT}장)</Label>
            <NoticePhotoUploader
              items={photos}
              onChange={setPhotos}
              disabled={pending || deleting}
              onUploadingChange={setPhotoUploading}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(event) => setIsPinned(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            상단 고정 (전체 최대 {NOTICE_PIN_LIMIT}개)
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {mode === "edit" && notice ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={pending || deleting}
              >
                삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/notices")}
                disabled={pending || deleting}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={pending || deleting || photoUploading || !title.trim() || !body.trim()}
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "edit" && notice ? (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>공지 삭제</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-3">
                  <p>공지 &quot;{notice.title}&quot;를 삭제하시겠습니까?</p>
                  <p>공개 페이지에서 즉시 내려가며, 데이터는 보존됩니다.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
              >
                취소
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </form>
  );
}
