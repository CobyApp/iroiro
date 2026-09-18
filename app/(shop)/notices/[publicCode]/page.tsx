import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { formatKstDate } from "@/lib/datetime";
import { getNoticeByPublicCode } from "@/modules/notices/lib/queries";
import { NOTICE_CATEGORY_LABELS } from "@/modules/notices/types";

type Props = { params: Promise<{ publicCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicCode } = await params;
  const notice = await getNoticeByPublicCode(publicCode);
  return { title: notice ? `공지 — ${notice.title}` : "공지사항" };
}

export default async function NoticeDetailPage({ params }: Props) {
  const { publicCode } = await params;
  // 삭제·미존재 공지는 동일 404 (soft delete는 쿼리에서 이미 제외)
  const notice = await getNoticeByPublicCode(publicCode);
  if (!notice) notFound();

  return (
    <article className="shop-page-frame space-y-6">
      <Link
        href="/posts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        커뮤니티로
      </Link>

      <header className="space-y-2 border-b border-border pb-4">
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {NOTICE_CATEGORY_LABELS[notice.category]}
        </span>
        <h1 className="text-2xl font-bold break-words">{notice.title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatKstDate(notice.createdAt)}
        </p>
      </header>

      {/* plain text 렌더 — rich text 미지원 (XSS 표면 최소화, 스펙 §보안) */}
      <div className="whitespace-pre-wrap break-words leading-relaxed">
        {notice.body}
      </div>

      {notice.photos.length > 0 && (
        <div className="space-y-3">
          {notice.photos.map((photo) => (
            /* eslint-disable-next-line @next/next/no-img-element -- R2 공개 URL 직서빙(스펙 §조회·렌더) */
            <img
              key={photo.r2Key}
              src={photo.url}
              alt=""
              loading="lazy"
              className="w-full rounded-md border border-border"
            />
          ))}
        </div>
      )}
    </article>
  );
}
