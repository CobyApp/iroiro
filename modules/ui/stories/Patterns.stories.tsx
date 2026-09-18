import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowUpRight, Heart, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShopPageHeader } from "../components/ShopPageHeader";

const meta = {
  title: "Design System/Patterns/Content",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "상품 탐색·빈 상태·섹션 헤더에서 반복하는 콘텐츠 패턴입니다. 행동 문구는 짧은 동사형으로 통일합니다.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const BrowseSection: Story = {
  render: () => (
    <section className="max-w-4xl rounded-md border border-border bg-card p-5 shadow-card sm:p-7">
      <div className="flex items-end justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <p className="text-xs font-medium tracking-[0.09em] text-muted-foreground">
            JUST ARRIVED
          </p>
          <h2 className="mt-1 font-display text-xl">새로 들어왔어요</h2>
        </div>
        <button className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          전체 보기 <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="aspect-[3/4] rounded-sm border border-border bg-lilac" />
            <div className="h-3 w-3/4 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-primary/15" />
          </div>
        ))}
      </div>
    </section>
  ),
};

export const PageHeader: Story = {
  render: () => (
    <div className="max-w-4xl p-4 sm:p-8">
      <ShopPageHeader
        eyebrow="IROIRO COMMUNITY"
        title="자유게시판"
        description="좋아하는 카드와 아이돌 이야기를 편하게 나눠보세요."
        action={<Button size="sm">글쓰기</Button>}
      />
    </div>
  ),
};

export const SearchAndFilter: Story = {
  render: () => (
    <div className="max-w-3xl space-y-3">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-10" placeholder="상품명·그룹·멤버 검색" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm">
          모든 그룹
        </Button>
        <Button variant="outline" size="sm">
          모든 멤버
        </Button>
        <Button variant="outline" size="sm">
          재고 있음
        </Button>
        <Button variant="ghost" size="sm">
          필터 초기화
        </Button>
      </div>
    </div>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardContent className="p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Heart className="h-6 w-6" />
        </span>
        <h2 className="mt-4 font-display text-lg">아직 저장한 상품이 없어요</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          마음에 드는 상품을 찜하고 나중에 다시 확인하세요.
        </p>
        <Button className="mt-5">상품 둘러보기</Button>
      </CardContent>
    </Card>
  ),
};

export const ProductSummary: Story = {
  render: () => (
    <Card className="max-w-sm overflow-hidden">
      <div className="relative aspect-[3/4] bg-lilac">
        <Badge className="absolute bottom-3 left-3">-20%</Badge>
        <Button
          variant="outline"
          size="icon"
          aria-label="찜하기"
          className="absolute right-3 top-3 h-8 w-8 bg-card/90"
        >
          <Heart className="h-4 w-4" />
        </Button>
      </div>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">
          CUTIE STREET / 사노 아이카
        </p>
        <p className="text-sm font-semibold">KAWAII LAB. Anniversary card</p>
        <p className="text-base font-semibold text-primary">₩6,000</p>
      </CardContent>
    </Card>
  ),
};
