import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";
import { Button } from "./button";
import { Toaster } from "./sonner";

const meta = {
  title: "Design System/Components/Toast (Sonner)",
  component: Toaster,
  tags: ["autodocs"],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

// 토스트 알림 — 장바구니 담기·저장 성공 등 피드백.
export const Triggers: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button onClick={() => toast.success("장바구니에 담았어요!")}>
        성공
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.info("이미 담긴 상품이에요")}
      >
        정보
      </Button>
      <Button
        variant="destructive"
        onClick={() => toast.error("문제가 발생했어요")}
      >
        오류
      </Button>
      <Toaster />
    </div>
  ),
};
