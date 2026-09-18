import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  preload?: boolean;
};

type BrandWordmarkProps = BrandMarkProps & {
  alt?: string;
};

type BrandLockupProps = BrandMarkProps & {
  markClassName?: string;
  wordmarkClassName?: string;
  wordmarkAlt?: string;
};

/** 이로이로의 공용 아이콘·워드마크. 테마와 무관한 브랜드 자산이다. */
export function BrandMark({ className, preload = false }: BrandMarkProps) {
  return (
    <Image
      src="/brand/iroiro-mark.png"
      alt=""
      width={160}
      height={160}
      preload={preload}
      aria-hidden="true"
      className={cn("object-contain", className)}
    />
  );
}

/** 가로형 브랜드 락업. 헤더·푸터처럼 아이콘과 이름을 함께 쓸 때 이 컴포넌트를 쓴다. */
export function BrandLockup({
  className,
  markClassName,
  wordmarkClassName,
  wordmarkAlt = "이로이로",
  preload = false,
}: BrandLockupProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2", className)}>
      <BrandMark className={cn("h-8 w-8", markClassName)} preload={preload} />
      <BrandWordmark
        className={cn("h-5 w-auto", wordmarkClassName)}
        alt={wordmarkAlt}
        preload={preload}
      />
    </span>
  );
}

export function BrandWordmark({
  className,
  preload = false,
  alt = "이로이로",
}: BrandWordmarkProps) {
  return (
    <Image
      src="/brand/iroiro-wordmark.png"
      alt={alt}
      width={400}
      height={90}
      preload={preload}
      className={cn("object-contain", className)}
    />
  );
}
