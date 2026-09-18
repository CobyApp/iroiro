"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  type AddressInput,
} from "../actions";
import type { AccountAddress } from "../types";

type FormState = {
  label: string;
  recipientName: string;
  recipientPhone: string;
  zipcode: string;
  baseAddress: string;
  detailAddress: string;
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  label: "",
  recipientName: "",
  recipientPhone: "",
  zipcode: "",
  baseAddress: "",
  detailAddress: "",
  isDefault: false,
};

function toInput(form: FormState): AddressInput {
  return {
    label: form.label || undefined,
    recipientName: form.recipientName,
    recipientPhone: form.recipientPhone,
    zipcode: form.zipcode,
    baseAddress: form.baseAddress,
    detailAddress: form.detailAddress || undefined,
    isDefault: form.isDefault,
  };
}

// 주소록 관리 — 목록 + 추가/수정 다이얼로그 + 기본 지정/삭제.
export function AddressBook({ addresses }: { addresses: AccountAddress[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, isDefault: addresses.length === 0 });
    setOpen(true);
  }

  function openEdit(address: AccountAddress) {
    setEditingId(address.id);
    setForm({
      label: address.label ?? "",
      recipientName: address.recipientName,
      recipientPhone: address.recipientPhone,
      zipcode: address.zipcode,
      baseAddress: address.baseAddress,
      detailAddress: address.detailAddress ?? "",
      isDefault: address.isDefault,
    });
    setOpen(true);
  }

  function submit() {
    startTransition(async () => {
      const result =
        editingId === null
          ? await createAddress(toInput(form))
          : await updateAddress(editingId, toInput(form));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(editingId === null ? "배송지를 추가했어요" : "배송지를 수정했어요");
      setOpen(false);
      router.refresh();
    });
  }

  function makeDefault(id: number) {
    startTransition(async () => {
      const result = await setDefaultAddress(id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("기본 배송지로 지정했어요");
      router.refresh();
    });
  }

  function remove(address: AccountAddress) {
    if (!window.confirm("이 배송지를 삭제할까요?")) return;
    startTransition(async () => {
      const result = await deleteAddress(address.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("배송지를 삭제했어요");
      router.refresh();
    });
  }

  const canSubmit =
    form.recipientName.trim() &&
    form.recipientPhone.trim() &&
    form.zipcode.trim() &&
    form.baseAddress.trim();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          자주 쓰는 배송지를 저장해 두세요 (최대 20개)
        </p>
        <Button size="sm" className="gap-1" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          배송지 추가
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-10 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 font-medium text-foreground">
            저장된 배송지가 없어요
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            배송지를 등록하면 주문할 때 바로 불러올 수 있어요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border bg-card p-4 shadow-card"
            >
              <div className="min-w-0 space-y-0.5">
                {/* Badge는 div라 p 안에 못 들어간다(hydration 오류) — div로 감싼다. */}
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                  {address.recipientName}
                  {address.label && (
                    <span className="text-muted-foreground">
                      · {address.label}
                    </span>
                  )}
                  {address.isDefault && <Badge>기본 배송지</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {address.recipientPhone}
                </p>
                <p className="text-sm text-foreground">
                  ({address.zipcode}) {address.baseAddress}
                  {address.detailAddress ? ` ${address.detailAddress}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-0.5">
                {!address.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    disabled={pending}
                    onClick={() => makeDefault(address.id)}
                  >
                    <Star className="h-3.5 w-3.5" />
                    기본 지정
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label="배송지 수정"
                  disabled={pending}
                  onClick={() => openEdit(address)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  aria-label="배송지 삭제"
                  disabled={pending}
                  onClick={() => remove(address)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingId === null ? "배송지 추가" : "배송지 수정"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  받는 사람
                </label>
                <Input
                  value={form.recipientName}
                  onChange={(e) =>
                    setForm({ ...form, recipientName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  별칭 (선택)
                </label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="집, 회사…"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">연락처</label>
              <Input
                value={form.recipientPhone}
                onChange={(e) =>
                  setForm({ ...form, recipientPhone: e.target.value })
                }
                inputMode="tel"
                placeholder="010-0000-0000"
              />
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  우편번호
                </label>
                <Input
                  value={form.zipcode}
                  onChange={(e) =>
                    setForm({ ...form, zipcode: e.target.value })
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">주소</label>
                <Input
                  value={form.baseAddress}
                  onChange={(e) =>
                    setForm({ ...form, baseAddress: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                상세 주소 (선택)
              </label>
              <Input
                value={form.detailAddress}
                onChange={(e) =>
                  setForm({ ...form, detailAddress: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) =>
                  setForm({ ...form, isDefault: e.target.checked })
                }
                className="h-4 w-4 accent-primary"
              />
              기본 배송지로 지정
            </label>
            <Button
              className="w-full"
              disabled={pending || !canSubmit}
              onClick={submit}
            >
              {pending ? "저장 중…" : "저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
