import type { Meta, StoryObj } from "@storybook/react-vite";
import { Compass, LibraryBig, MessageSquare, User } from "lucide-react";

const meta = {
  title: "Design System/Patterns/Navigation",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "탐색은 둘러보기·컬렉션·커뮤니티·마이로 고정합니다. 장바구니와 찜은 헤더 보조 동작으로 분리합니다.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NAV_ITEMS = [
  { label: "둘러보기", Icon: Compass },
  { label: "컬렉션", Icon: LibraryBig },
  { label: "커뮤니티", Icon: MessageSquare },
  { label: "마이", Icon: User },
] as const;

export const Desktop: Story = {
  render: () => (
    <div className="max-w-3xl p-4 sm:p-8">
      <nav
        aria-label="주요 메뉴 예시"
        className="flex items-center justify-between rounded-md border border-border bg-card p-3 shadow-card"
      >
        <span className="text-base font-semibold text-primary">이로이로</span>
        <div className="flex items-center gap-1">
          {NAV_ITEMS.slice(0, 3).map(({ label, Icon }) => (
            <a
              key={label}
              href={`#${label}`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted ${
                label === "둘러보기"
                  ? "bg-primary/10 text-primary"
                  : "text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{label}</span>
            </a>
          ))}
        </div>
        <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          로그인
        </button>
      </nav>
    </div>
  ),
};

export const Mobile: Story = {
  render: () => (
    <div className="mx-auto max-w-sm p-4 sm:p-8">
      <div className="overflow-hidden rounded-md border border-border bg-card shadow-card">
        <div className="h-72 bg-background p-5 text-sm text-muted-foreground">
          화면 콘텐츠
        </div>
        <nav
          aria-label="하단 내비게이션 예시"
          className="border-t border-border"
        >
          <ul className="flex items-stretch justify-around px-1">
            {NAV_ITEMS.map(({ label, Icon }, index) => {
              const active = index === 0;
              return (
                <li key={label} className="flex-1">
                  <a
                    href={`#${label}`}
                    className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[10px] font-medium ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`grid h-7 min-w-10 place-items-center rounded-full ${
                        active ? "bg-primary/12" : ""
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  ),
};
