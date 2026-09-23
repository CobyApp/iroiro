"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing, BellOff } from "lucide-react";
import {
  deletePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "../actions";

// 벨 팝오버 하단의 웹 푸시 토글 — 브라우저 미지원/키 미설정이면 렌더하지 않는다.
// (iOS Safari는 홈 화면에 추가한 PWA에서만 푸시 지원 — 미지원으로 감지되면 숨김)

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "off" | "on" | "denied";

export function PushToggle({
  variant = "popover",
}: {
  /** popover: 벨 팝오버 하단(미지원 시 숨김) · settings: 마이페이지 설정 카드(상태 항상 표시) */
  variant?: "popover" | "settings";
}) {
  const [state, setState] = useState<State | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    (async () => {
      if (
        !VAPID_PUBLIC_KEY ||
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (active) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await registration?.pushManager.getSubscription();
      if (active) setState(sub ? "on" : "off");
    })().catch(() => {
      if (active) setState("unsupported");
    });
    return () => {
      active = false;
    };
  }, []);

  function enable() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          if (permission === "denied") {
            toast.error("브라우저 알림이 차단되어 있어요. 사이트 설정에서 허용해 주세요.");
          }
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          throw new Error("subscription payload missing keys");
        }
        const result = await savePushSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        });
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setState("on");
        toast.success("이 기기로 푸시 알림을 보내드릴게요!");
      } catch (error) {
        console.error("[push] 구독 실패", error);
        toast.error("푸시 알림 설정에 실패했어요.");
      }
    });
  }

  function sendTest() {
    startTransition(async () => {
      const result = await sendTestPush();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("테스트 알림을 보냈어요. 잠시 후 기기 알림을 확인해 주세요!");
    });
  }

  function disable() {
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await deletePushSubscription({ endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setState("off");
        toast.success("푸시 알림을 껐어요.");
      } catch (error) {
        console.error("[push] 해제 실패", error);
        toast.error("푸시 알림 해제에 실패했어요.");
      }
    });
  }

  if (variant === "settings") {
    const statusLabel =
      state === null
        ? "확인 중…"
        : state === "on"
          ? "켜짐"
          : state === "denied"
            ? "브라우저에서 차단됨"
            : state === "unsupported"
              ? "이 브라우저 미지원"
              : "꺼짐";
    const canToggle = state === "on" || state === "off";
    return (
      <div className="space-y-1">
      <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5">
        <BellRing className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">휴대폰·PC 푸시 알림</span>
          <span className="block text-xs text-muted-foreground">
            {state === "unsupported"
              ? "이 브라우저에선 지원되지 않아요 (iOS는 홈 화면에 추가한 앱에서 가능)"
              : state === "denied"
                ? "브라우저 사이트 설정에서 알림을 허용하면 켤 수 있어요"
                : "입찰 추월·낙찰·주문 소식을 기기로 받아요"}
          </span>
        </span>
        {canToggle ? (
          <button
            type="button"
            role="switch"
            aria-checked={state === "on"}
            onClick={state === "on" ? disable : enable}
            disabled={pending}
            className={
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors disabled:opacity-50 " +
              (state === "on" ? "bg-primary" : "bg-muted-foreground/30")
            }
          >
            <span
              className={
                "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform " +
                (state === "on" ? "translate-x-5" : "translate-x-0")
              }
            />
            <span className="sr-only">푸시 알림 {state === "on" ? "끄기" : "켜기"}</span>
          </button>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">{statusLabel}</span>
        )}
      </div>
      {state === "on" && (
        <button
          type="button"
          onClick={sendTest}
          disabled={pending}
          className="ml-3 text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
        >
          이 기기로 테스트 알림 보내기
        </button>
      )}
      </div>
    );
  }

  if (state === null || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <p className="px-4 py-2.5 text-[11px] text-muted-foreground">
        브라우저에서 알림이 차단돼 있어요 — 사이트 설정에서 허용하면 푸시를 받을 수 있어요.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={state === "on" ? disable : enable}
      disabled={pending}
      className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
    >
      {state === "on" ? (
        <>
          <BellOff className="h-3.5 w-3.5" />
          이 기기 푸시 알림 끄기
        </>
      ) : (
        <>
          <BellRing className="h-3.5 w-3.5 text-primary" />
          휴대폰·PC 푸시 알림 받기
        </>
      )}
    </button>
  );
}
