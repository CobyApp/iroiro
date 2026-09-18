import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Calendar } from "./calendar";

const meta = {
  title: "Design System/Components/Calendar",
  component: Calendar,
  tags: ["autodocs"],
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

function CalendarDemo() {
  const [selected, setSelected] = useState<Date | undefined>(undefined);
  return <Calendar mode="single" selected={selected} onSelect={setSelected} />;
}

// 단일 날짜 선택 — 배너 게시기간 등 날짜 입력의 기반.
export const Single: Story = {
  render: () => <CalendarDemo />,
};
