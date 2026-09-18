import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta = {
  title: "Design System/Components/Input",
  component: Input,
  tags: ["autodocs"],
  args: { placeholder: "상품명·그룹·멤버 검색" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: "NewJeans" } };
export const Disabled: Story = {
  args: { disabled: true, defaultValue: "비활성" },
};
