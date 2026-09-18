import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta = {
  title: "Design System/Components/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

// 상품 카드 로딩 플레이스홀더.
export const ProductCard: Story = {
  render: () => (
    <div className="w-44 space-y-2.5">
      <Skeleton className="aspect-[3/4] w-full rounded-sm border border-border shadow-card" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  ),
};
