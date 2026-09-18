import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Badge } from "./badge";
import { Button } from "./button";

const meta = {
  title: "Design System/Components/Card",
  component: Card,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: 340 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>NewJeans ‘Get Up’ 민지 포토카드</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge>-17%</Badge>
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700"
          >
            거의 새것
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          실물 스캔 후 슬리브+탑로더로 안전 포장하여 발송합니다.
        </p>
        <Button className="w-full">장바구니에 담기</Button>
      </CardContent>
    </Card>
  ),
};
