import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DatePicker } from "./date-picker";

const meta = {
  title: "Design System/Components/DatePicker",
  component: DatePicker,
  tags: ["autodocs"],
  args: { value: null, onChange: () => {} },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

function DatePickerDemo() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div className="w-64">
      <DatePicker value={value} onChange={setValue} placeholder="날짜 선택" />
    </div>
  );
}

// 팝오버 + 캘린더 날짜 선택 입력.
export const Default: Story = {
  render: () => <DatePickerDemo />,
};
