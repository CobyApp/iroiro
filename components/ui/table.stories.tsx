import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "Design System/Components/Table",
  component: Table,
  tags: ["autodocs"],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

// 관리자 목록(상품·그룹 등)에서 쓰는 테이블.
export const Basic: Story = {
  render: () => (
    <div className="w-[520px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>상품</TableHead>
            <TableHead>그룹</TableHead>
            <TableHead className="text-right">가격</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            { n: "후루사와 리사 · ver.9", g: "CUTIE STREET", p: "₩3,800" },
            { n: "사노 아이카 · ver.4", g: "CUTIE STREET", p: "₩6,983" },
            { n: "마스다 아야노 · ver.4", g: "CUTIE STREET", p: "₩8,294" },
          ].map((r) => (
            <TableRow key={r.n}>
              <TableCell>{r.n}</TableCell>
              <TableCell>{r.g}</TableCell>
              <TableCell className="text-right">{r.p}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};
