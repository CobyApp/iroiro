"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Viewer3DCard = {
  front: string | null;
  back: string | null;
  title: string;
};

// 카드 풀스크린 3D 뷰어 — body로 portal(상·하단 바까지 덮음).
// 포인터/터치로 기울고, 뒷면 있으면 뒤집기. 제어형: card 있으면 표시.
export function CardViewer3D({
  card,
  onClose,
}: {
  card: Viewer3DCard | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!card) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [card, onClose]);

  if (!card || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-black/90 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={card.title}
      onClick={onClose}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 z-10 h-11 w-11 border border-white/50 bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </Button>

      {/* key로 카드 바뀔 때 플립 상태 리셋 */}
      <CardStage key={card.front ?? card.title} card={card} />
    </div>,
    document.body,
  );
}

function CardStage({ card }: { card: Viewer3DCard }) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [flipped, setFlipped] = useState(false);
  const hasBack = Boolean(card.back);

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ ry: (px - 0.5) * 26, rx: -(py - 0.5) * 26 });
  }

  return (
    <div
      className="flex flex-col items-center gap-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="[perspective:1200px]">
        <div
          onPointerMove={handleMove}
          onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
          className="relative aspect-[3/4] w-[min(82vw,440px)] transition-transform duration-200 ease-out will-change-transform [transform-style:preserve-3d]"
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry + (flipped ? 180 : 0)}deg)`,
          }}
        >
          <Face src={card.front} alt={card.title} sheen={tilt.ry} />
          <Face
            src={card.back}
            alt={`${card.title} 뒷면`}
            sheen={tilt.ry}
            back
          />
        </div>
      </div>

      <p className="max-w-[82vw] truncate text-center font-display text-sm text-white/90">
        {card.title}
      </p>
      <p className="-mt-2 text-center text-xs text-white/55">
        마우스나 손가락으로 움직여 3D 각도를 바꿔보세요
      </p>

      {hasBack && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setFlipped((f) => !f)}
          className="border border-white/50 bg-white/10 px-4 text-sm text-white hover:bg-white/20"
        >
          <RotateCw className="h-4 w-4" />
          {flipped ? "앞면 보기" : "뒤집어 보기"}
        </Button>
      )}
    </div>
  );
}

function Face({
  src,
  alt,
  sheen,
  back = false,
}: {
  src: string | null;
  alt: string;
  sheen: number;
  back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-lg border border-white/70 shadow-2xl [backface-visibility:hidden]"
      style={back ? { transform: "rotateY(180deg)" } : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 이미지, 풀스크린 뷰어
        <img
          src={src}
          alt={alt}
          draggable={false}
          onContextMenu={(event) => event.preventDefault()}
          className="h-full w-full select-none object-cover"
        />
      ) : (
        <div className="grid h-full w-full place-items-center bg-neutral-800 text-4xl">
          🎴
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(${105 + sheen * 2}deg, rgba(255,255,255,0) 32%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 68%)`,
        }}
      />
    </div>
  );
}
