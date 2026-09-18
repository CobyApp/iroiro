"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Gavel, Heart, Mail, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "../actions";
import type { NotificationItem } from "../lib/queries";
import { PushToggle } from "./PushToggle";

const TYPE_ICON = {
  bid_outbid: Gavel,
  auction_won: Gavel,
  auction_expired: Gavel,
  order_paid: PackageCheck,
  order_shipped: Truck,
  order_delivered: Truck,
  referral_joined: Bell,
  wish_alert: Heart,
  message: Mail,
  system: Bell,
} as const;

function agoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function NotificationBellClient({
  unread,
  items,
}: {
  unread: number;
  items: NotificationItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function onItemClick(item: NotificationItem) {
    setOpen(false);
    startTransition(async () => {
      if (!item.read) await markNotificationRead({ id: item.id });
      if (item.link) router.push(item.link);
      router.refresh();
    });
  }

  function onMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-1.5 px-2.5"
          aria-label={`알림${unread > 0 ? ` ${unread}개 안 읽음` : ""}`}
        >
          <Bell className="h-5 w-5" />
          <span className="hidden lg:inline">알림</span>
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold">알림</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              모두 읽음
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            아직 알림이 없어요
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? Bell;
              return (
                <li key={item.id} className="border-b border-border/60 last:border-0">
                  <button
                    type="button"
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                      !item.read && "bg-primary/[.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                        item.read
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px] leading-snug",
                          item.read
                            ? "text-muted-foreground"
                            : "font-semibold text-foreground",
                        )}
                      >
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                          {item.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                        {agoLabel(item.createdAt)}
                      </span>
                    </span>
                    {!item.read && (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <PushToggle />
      </PopoverContent>
    </Popover>
  );
}
