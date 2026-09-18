import { CalendarClock, Info, Sparkles } from "lucide-react";
import type { PostTopic } from "../types";

// 게시판 고정 가이드 — 각 보드의 용도·규칙을 항상 상단에 안내(운영 공지와 별개의 정적 가이드).
type Guide = {
  icon: typeof Info;
  title: string;
  lines: string[];
};

const GUIDES: Record<"all" | PostTopic, Guide> = {
  all: {
    icon: Info,
    title: "커뮤니티 이용 안내",
    lines: [
      "팬들이 함께 쓰는 공간이에요 — 이벤트·정모 소식과 자랑·수다를 나눠요.",
      "사고파는 글은 커뮤니티가 아니라 중고거래 탭을 이용해주세요.",
      "서로 존중해주세요. 신고가 쌓이면 글·댓글 작성이 제한될 수 있어요.",
    ],
  },
  event: {
    icon: CalendarClock,
    title: "이벤트·모임 가이드",
    lines: [
      "생일카페·컵홀더·팝업·정모 등 오프라인 행사를 올리는 곳이에요.",
      "일시·장소·예약/공지 링크를 남기면 D-day와 함께 눈에 잘 띄어요.",
      "지난 이벤트는 자동으로 아래로 내려가요.",
    ],
  },
  community: {
    icon: Sparkles,
    title: "자랑·수다 가이드",
    lines: [
      "개봉·컬렉션 자랑, 최애 수다, 시세·정품 질문을 자유롭게 나눠요.",
      "사진과 최애(그룹·멤버) 태그를 붙이면 더 잘 보여요.",
      "토레카를 붙이면 카드 정보·시세도 함께 보여줄 수 있어요.",
    ],
  },
};

export function BoardGuide({ topic }: { topic?: PostTopic }) {
  const guide = GUIDES[topic ?? "all"];
  const Icon = guide.icon;
  return (
    <details className="group rounded-xl border border-border bg-card/60 px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
        <Icon aria-hidden className="h-4 w-4 text-primary" />
        {guide.title}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
          펼치기
        </span>
        <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">
          접기
        </span>
      </summary>
      <ul className="mt-2 space-y-1 pl-6 text-xs leading-relaxed text-muted-foreground">
        {guide.lines.map((line) => (
          <li key={line} className="list-disc">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}
