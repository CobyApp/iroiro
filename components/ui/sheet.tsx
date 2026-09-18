"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "motion-overlay fixed inset-0 z-50 bg-[rgb(56_44_88_/_36%)] backdrop-blur-[3px]",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "motion-sheet fixed z-50 flex flex-col gap-5 overflow-y-auto border-border/90 bg-card p-5 shadow-elevated outline-none sm:p-6",
          side === "right" &&
            "inset-y-0 right-0 h-full w-[min(88vw,24rem)] rounded-l-[1.5rem] border-l",
          side === "left" &&
            "inset-y-0 left-0 h-full w-[min(88vw,24rem)] rounded-r-[1.5rem] border-r",
          side === "top" &&
            "inset-x-0 top-0 rounded-b-[1.5rem] border-b pt-[calc(1.25rem+env(safe-area-inset-top))]",
          // 하단 시트는 홈 인디케이터/제스처바 영역만큼 아래 여백을 더 준다(standalone PWA).
          side === "bottom" &&
            "inset-x-0 bottom-0 rounded-t-[1.5rem] border-t pt-8 pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
          className,
        )}
        {...props}
      >
        {side === "bottom" && (
          <span
            className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-border"
            aria-hidden="true"
          />
        )}
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-muted/75 text-muted-foreground outline-none transition-[background-color,color,transform] hover:bg-muted hover:text-foreground active:scale-95 focus:ring-2 focus:ring-ring sm:right-4 sm:top-4">
          <X className="h-4 w-4" />
          <span className="sr-only">닫기</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col space-y-2 pr-9 text-left", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "font-display text-xl font-semibold leading-tight",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end sm:[&>[data-slot=button]]:w-auto [&>[data-slot=button]]:w-full",
        className,
      )}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
