import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta = {
  title: "Design System/Components/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
  },
  args: { children: "저장" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { variant: "default" } };
export const Secondary: Story = {
  args: { variant: "secondary", children: "필터 초기화" },
};
export const Outline: Story = {
  args: { variant: "outline", children: "취소" },
};
export const Destructive: Story = {
  args: { variant: "destructive", children: "삭제" },
};
export const Ghost: Story = { args: { variant: "ghost", children: "더 보기" } };
export const Link: Story = {
  args: { variant: "link", children: "자세히 보기" },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">
        보조 동작
      </Button>
      <Button {...args} size="default">
        기본 동작
      </Button>
      <Button {...args} size="lg">
        주요 동작
      </Button>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">저장</Button>
      <Button variant="secondary">필터 초기화</Button>
      <Button variant="outline">취소</Button>
      <Button variant="destructive">삭제</Button>
      <Button variant="ghost">더 보기</Button>
      <Button variant="link">자세히 보기</Button>
    </div>
  ),
};
