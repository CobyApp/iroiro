import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

const meta = {
  title: "Design System/Components/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">가리켜 보세요</Button>
        </TooltipTrigger>
        <TooltipContent>장바구니에 담기</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
