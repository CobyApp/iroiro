"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import {
  deleteCollection,
  setCollectionPublic,
  setCollectionTitle,
} from "../actions";

type Props = {
  collectionId: number;
  title: string;
  isPublic: boolean;
};

export function CollectionSettings({ collectionId, title, isPublic }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(title);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      router.refresh();
      toast.success(successMessage);
    });
  }

  function removeCollection() {
    startTransition(async () => {
      const result = await deleteCollection({ collectionId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setDeleteOpen(false);
      toast.success("컬렉션을 삭제했습니다");
      router.push("/collections");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          aria-label="컬렉션 이름"
        />
        <Button
          variant="outline"
          disabled={pending || name.trim() === title || name.trim() === ""}
          onClick={() =>
            run(
              () => setCollectionTitle({ collectionId, title: name.trim() }),
              "이름을 변경했습니다",
            )
          }
        >
          이름 저장
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={isPublic ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            run(
              () => setCollectionPublic({ collectionId, isPublic: !isPublic }),
              isPublic ? "비공개로 전환했습니다" : "컬렉션을 공개했습니다",
            )
          }
        >
          {isPublic ? "비공개로 전환" : "공개하기"}
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => setDeleteOpen(true)}
        >
          컬렉션 삭제
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>컬렉션을 삭제할까요?</DialogTitle>
            <DialogDescription>
              등록한 카드 목록도 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                취소
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={removeCollection}
            >
              {pending ? "삭제 중…" : "컬렉션 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
