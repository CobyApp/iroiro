import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// 별점 표시(읽기 전용) — 목록·요약 공용.
export function ReviewStars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      aria-label={`별점 ${rating}점`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= rating
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
