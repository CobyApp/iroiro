import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta = {
  title: "Design System/Components/Select",
  component: Select,
  tags: ["autodocs"],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

// 상품 필터(그룹·멤버·정렬)에서 쓰는 셀렉트.
export const Group: Story = {
  render: () => (
    <Select defaultValue="__all__">
      <SelectTrigger className="w-40">
        <SelectValue placeholder="그룹" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">모든 그룹</SelectItem>
        <SelectItem value="1">CUTIE STREET</SelectItem>
        <SelectItem value="2">FRUITS ZIPPER</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const Sort: Story = {
  render: () => (
    <Select defaultValue="newest">
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="newest">신상순</SelectItem>
        <SelectItem value="price_asc">낮은 가격순</SelectItem>
        <SelectItem value="price_desc">높은 가격순</SelectItem>
      </SelectContent>
    </Select>
  ),
};
