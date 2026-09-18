import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

const meta = {
  title: "Design System/Components/Command",
  component: Command,
  tags: ["autodocs"],
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

// 검색형 커맨드 목록 — 콤보박스·검색 팔레트에 사용.
export const Search: Story = {
  render: () => (
    <Command className="w-80 rounded-md border border-border shadow-card">
      <CommandInput placeholder="그룹·멤버 검색..." />
      <CommandList>
        <CommandEmpty>결과가 없어요</CommandEmpty>
        <CommandGroup>
          <CommandItem>CUTIE STREET</CommandItem>
          <CommandItem>FRUITS ZIPPER</CommandItem>
          <CommandItem>CANDY TUNE</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
