"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { duplicateProductAsListing } from "../actions";

// 같은 카드로 새 매물 만들기 — 복제 후 새 매물 편집으로 이동.
export function DuplicateListingButton({ productId }: { productId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const { id } = await duplicateProductAsListing(productId);
        toast.success("새 매물 초안을 만들었어요 — 컨디션·가격을 수정하세요");
        router.push(`/admin/products/${id}/edit`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "복제 실패");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={run}
      disabled={pending}
      className="gap-1.5"
    >
      <CopyPlus className="h-4 w-4" />
      {pending ? "만드는 중…" : "같은 카드로 새 매물"}
    </Button>
  );
}
