import type { Meta, StoryObj } from "@storybook/react-vite";
import { Settings } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta = {
  title: "Design System/Components/Popover",
  component: Popover,
  tags: ["autodocs"],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

// 계정·설정 메뉴에서 쓰는 팝오버.
export const Menu: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="설정">
          <Settings className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <p className="truncate px-3 pb-2 pt-1 font-display text-sm">
          도로롱님 ✿
        </p>
        <div className="border-t-2 border-border/30 pt-1">
          <button className="flex w-full items-center rounded-full px-3 py-2 text-sm hover:bg-muted">
            회원정보 변경
          </button>
          <button className="flex w-full items-center rounded-full px-3 py-2 text-sm text-destructive hover:bg-muted">
            로그아웃
          </button>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
