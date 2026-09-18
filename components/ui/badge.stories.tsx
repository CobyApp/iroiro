import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = {
  title: "Design System/Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "overlay"],
    },
  },
  args: { children: "배지" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: "default", children: "-24%" },
};
export const Secondary: Story = {
  args: { variant: "secondary", children: "NEW" },
};
export const Outline: Story = {
  args: { variant: "outline", children: "품절" },
};
export const Destructive: Story = {
  args: { variant: "destructive", children: "마감" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="default">-24%</Badge>
      <Badge variant="secondary">NEW</Badge>
      <Badge variant="outline">품절</Badge>
      <Badge variant="destructive">마감</Badge>
      <Badge
        variant="default"
        style={{ background: "#46e3e6", color: "#3a1d5c" }}
      >
        멤버컬러
      </Badge>
    </div>
  ),
};

export const ConditionBadges: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className="border-sky-300 bg-sky-50 text-sky-700"
      >
        새상품
      </Badge>
      <Badge
        variant="outline"
        className="border-emerald-300 bg-emerald-50 text-emerald-700"
      >
        거의 새것
      </Badge>
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-700"
      >
        양호
      </Badge>
      <Badge
        variant="outline"
        className="border-orange-300 bg-orange-50 text-orange-700"
      >
        사용감 있음
      </Badge>
      <Badge
        variant="outline"
        className="border-red-300 bg-red-50 text-red-700"
      >
        상태 나쁨
      </Badge>
    </div>
  ),
};
