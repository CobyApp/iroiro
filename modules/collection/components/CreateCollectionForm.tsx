"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCollection } from "../actions";

export function CreateCollectionForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");

  function handleCreate() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.info("컬렉션 이름을 입력해주세요");
      return;
    }
    startTransition(async () => {
      const result = await createCollection({ title: trimmed });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setTitle("");
      router.refresh();
      toast.success("컬렉션을 만들었습니다");
      onCreated?.();
    });
  }

  return (
    <div className="flex gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={20}
        placeholder="새 컬렉션 이름 (최대 20자)"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleCreate();
        }}
      />
      <Button onClick={handleCreate} disabled={pending}>
        만들기
      </Button>
    </div>
  );
}
