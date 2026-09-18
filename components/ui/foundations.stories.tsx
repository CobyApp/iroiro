import type { Meta, StoryObj } from "@storybook/react-vite";

// 디자인 토큰 카탈로그 — globals.css의 단일 진실을 시각화한다.
// (렌더 전용 스토리라 컴포넌트 없이 Meta title만 사용)
const meta = {
  title: "Design System/Foundations/Overview",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const BRAND = [
  { name: "primary / hotpink", v: "#FF639C" },
  { name: "pink", v: "#FFADC9" },
  { name: "purple", v: "#9A8CF4" },
  { name: "cyan", v: "#93DCF8" },
  { name: "lemon", v: "#FFE99A" },
  { name: "ink", v: "#382C58" },
  { name: "cream", v: "#FFFDF9" },
];

const SHADOWS = [
  { name: "shadow-card", cls: "shadow-card" },
  { name: "shadow-elevated", cls: "shadow-elevated" },
  { name: "shadow-banner", cls: "shadow-banner" },
];

const RADII = [
  { name: "xs · 12px", cls: "rounded-xs" },
  { name: "sm · 18px", cls: "rounded-sm" },
  { name: "md · 25px", cls: "rounded-md" },
  { name: "lg · 32px", cls: "rounded-lg" },
  { name: "full", cls: "rounded-full" },
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 font-display text-xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

export const Palette: Story = {
  render: () => (
    <div className="p-8">
      <Section title="Brand palette">
        <div className="flex flex-wrap gap-4">
          {BRAND.map((c) => (
            <div key={c.name} className="text-center">
              <div
                className="h-20 w-20 rounded-md border border-ink shadow-card"
                style={{ background: c.v }}
              />
              <p className="mt-2 font-display text-xs text-ink">{c.name}</p>
              <p className="text-[10px] text-ink-faint">{c.v}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation">
        <div className="flex flex-wrap gap-8">
          {SHADOWS.map((s) => (
            <div key={s.name} className="text-center">
              <div
                className={`h-16 w-16 rounded-sm border border-ink bg-white ${s.cls}`}
              />
              <p className="mt-3 font-display text-xs text-ink">{s.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius scale">
        <div className="flex flex-wrap items-end gap-6">
          {RADII.map((r) => (
            <div key={r.name} className="text-center">
              <div
                className={`h-16 w-16 border border-ink bg-lemon ${r.cls}`}
              />
              <p className="mt-3 font-display text-xs text-ink">{r.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography roles">
        <div className="space-y-2">
          <p className="font-display text-3xl text-ink">
            제목 · Mochiy Pop One
          </p>
          <p className="text-xl text-ink">본문 · Jua (sans)</p>
          <p className="text-sm font-medium text-ink">
            조작 요소 · 본문 서체 + medium weight
          </p>
          <p className="text-sm text-ink-soft">보조 텍스트 · ink-soft</p>
          <p className="text-xs text-ink-faint">힌트·캡션 · ink-faint</p>
        </div>
      </Section>

      <Section title="Interaction rules">
        <div className="grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="font-medium text-foreground">테두리</p>
            <p className="mt-1">모든 표면은 1px 테두리를 사용합니다.</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="font-medium text-foreground">그림자</p>
            <p className="mt-1">카드·배너에만 낮은 깊이를 사용합니다.</p>
          </div>
          <div className="rounded-sm border border-border bg-card p-4">
            <p className="font-medium text-foreground">모션</p>
            <p className="mt-1">
              짧은 색·위치 전환만 사용하고 모션 감소를 존중합니다.
            </p>
          </div>
        </div>
      </Section>
    </div>
  ),
};
