import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

const meta = {
  title: "Design System/Components/Sheet",
  component: Sheet,
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// 모바일 필터 등 측면에서 슬라이드되는 패널.
export const Side: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">필터 열기</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription>
            원하는 조건을 선택해 상품을 빠르게 찾아보세요.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-2 p-4 text-sm text-muted-foreground">
          그룹·멤버·재고 필터가 여기에 들어갑니다.
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button className="w-full">적용</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Bottom: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>모바일 필터 열기</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription>
            바텀시트는 손잡이, 닫기 버튼, 안전영역을 기본으로 제공합니다.
          </SheetDescription>
        </SheetHeader>
        <div className="py-5 text-sm text-muted-foreground">
          필터 옵션을 선택할 수 있습니다.
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">초기화</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button>적용</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
