"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Team } from "@/modules/teams/types";
import type { MemberWithTeams } from "@/modules/members/types";
import type { SeriesOption } from "@/modules/series/lib/queries";
import { CatalogCardBrowser } from "./CatalogCardBrowser";
import type { CatalogCardPick } from "../actions";

type Props = {
  teams: Team[];
  members: MemberWithTeams[];
  series: SeriesOption[];
  catalogPublicBase: string;
  /** 선택 시 폼 필드를 채운다. 이미지 복사는 부모가 별도로 처리한다. */
  onPick: (card: CatalogCardPick) => void;
};

// 상품 등록(단건 폼)에서 공유 카탈로그 카드를 하나 골라 그룹·멤버·시리즈·이름·정가·이미지를 한 번에 불러온다.
// 카탈로그·커머스 DB 는 분리돼 있어 여기서 읽은 id 값만 상품에 참조로 저장된다.
export function CatalogCardPicker({ teams, members, series, catalogPublicBase, onPick }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          카탈로그에서 토레카 불러오기
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>토레카 불러오기</DialogTitle>
        </DialogHeader>
        <CatalogCardBrowser
          teams={teams}
          members={members}
          series={series}
          catalogPublicBase={catalogPublicBase}
          selectable="single"
          onPick={(card) => {
            onPick(card);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
