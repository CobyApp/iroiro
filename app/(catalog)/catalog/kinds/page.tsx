import type { Metadata } from "next";
import { countSeriesByKind, listSeriesKinds } from "@/modules/series/lib/kinds-queries";
import { SeriesKindsManage } from "@/modules/series/components/SeriesKindsManage";
import { AdminPageHeader } from "@/modules/admin/components/AdminPageHeader";

export const metadata: Metadata = { title: "시리즈 종류" };

// 시리즈 종류 — 랜덤·이벤트·CD 특전 같은 분류의 라벨과 표시 순서를 관리한다.
export default async function CatalogKindsPage() {
  const [kinds, usage] = await Promise.all([listSeriesKinds(), countSeriesByKind()]);
  // 표에 없는 키가 데이터에만 있으면 알려준다(코드 상수 폴백으로 라벨은 나오지만 편집 불가).
  const unknownKeys = Object.keys(usage).filter((k) => !kinds.some((kind) => kind.key === k));

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="SERIES KINDS"
        title="시리즈 종류"
        count={kinds.length}
        description="종류의 라벨과 순서를 바꾸면 시리즈·카드 화면과 고객 필터에 바로 반영돼요. 키는 시리즈 데이터가 참조하므로 만든 뒤 바꿀 수 없어요."
      />
      {unknownKeys.length > 0 && (
        <p className="rounded-md border border-border bg-lemon/40 px-3 py-2 text-xs text-ink">
          목록에 없는 종류 키가 시리즈 데이터에 있어요: {unknownKeys.map((k) => `${k}(${usage[k]})`).join(", ")} —
          같은 키로 종류를 추가하면 라벨을 편집할 수 있어요.
        </p>
      )}
      <SeriesKindsManage kinds={kinds} usage={usage} />
    </div>
  );
}
