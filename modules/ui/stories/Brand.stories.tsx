import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrandLockup, BrandMark, BrandWordmark } from "../components/BrandMark";

const meta = {
  title: "Design System/Brand/Logo",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "이로이로의 아이콘·워드마크입니다. 로고 파일을 직접 복제하지 말고 이 컴포넌트를 사용합니다.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lockups: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-6 p-4 sm:grid-cols-2 sm:p-8">
      <section className="rounded-md border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">ICON MARK</p>
        <div className="mt-5 flex items-end gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-sm border border-border bg-background">
            <BrandMark className="h-10 w-10" preload />
          </span>
          <span className="grid h-20 w-20 place-items-center rounded-md border border-border bg-background">
            <BrandMark className="h-14 w-14" />
          </span>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">
          정사각형 아이콘, 앱 아이콘, 좁은 헤더에 사용합니다.
        </p>
      </section>

      <section className="rounded-md border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">WORDMARK</p>
        <div className="mt-7 flex items-center">
          <BrandWordmark className="h-9 w-auto" preload />
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          넓은 헤더와 소개 화면에 사용합니다. 비율을 유지하고 별도 텍스트로
          대체하지 않습니다.
        </p>
      </section>

      <section className="rounded-md border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">LOCKUP</p>
        <div className="mt-7 flex items-center">
          <BrandLockup
            markClassName="h-10 w-10"
            wordmarkClassName="h-6"
            preload
          />
        </div>
        <p className="mt-7 text-sm text-muted-foreground">
          헤더·푸터처럼 아이콘과 이름을 나란히 쓸 때 사용합니다.
        </p>
      </section>
    </div>
  ),
};
