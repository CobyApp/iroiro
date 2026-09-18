import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Design System/Components/Label",
  component: Label,
  tags: ["autodocs"],
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

// 폼 필드 라벨 — 입력과 htmlFor로 연결.
export const WithInput: Story = {
  render: () => (
    <div className="w-72 space-y-1.5">
      <Label htmlFor="nickname">닉네임</Label>
      <Input id="nickname" placeholder="도로롱" />
    </div>
  ),
};
