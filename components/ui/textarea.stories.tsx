import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./textarea";

const meta = {
  title: "Design System/Components/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: { placeholder: "상품 설명을 입력하세요" },
  argTypes: { disabled: { control: "boolean" } },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true, value: "수정 불가" } };
