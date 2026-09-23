import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, XCircle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { getOrderByOrderNo } from "@/modules/orders/lib/queries";

export const metadata: Metadata = { title: "결제 결과" };

// 결제 결과 화면 — 카카오페이 승인/취소/실패 콜백이 이리로 되돌려보낸다.
// status(paid|cancel|fail)와 kind(order|trade|bundle)·id로 상황별 안내를 보여준다.
// 구매 유형에 맞는 "상세 보기" 동선과 다음 행동(계속 쇼핑/장바구니)을 제공한다.

type SearchParams = Promise<{
  status?: string;
  kind?: string;
  order?: string;
  id?: string;
}>;

type Status = "paid" | "cancel" | "fail";

const STATUS_VIEW: Record<
  Status,
  { icon: typeof CheckCircle2; iconClass: string; title: string; desc: string }
> = {
  paid: {
    icon: CheckCircle2,
    iconClass: "text-primary",
    title: "결제가 완료되었습니다",
    desc: "주문이 정상적으로 접수되었어요.",
  },
  cancel: {
    icon: Ban,
    iconClass: "text-muted-foreground",
    title: "결제를 취소했어요",
    desc: "결제가 진행되지 않았어요. 다시 시도할 수 있어요.",
  },
  fail: {
    icon: XCircle,
    iconClass: "text-destructive",
    title: "결제에 실패했어요",
    desc: "결제가 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
  },
};

function normalizeStatus(value: string | undefined): Status {
  if (value === "paid" || value === "cancel" || value === "fail") return value;
  return "fail";
}

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("orders"));

  const status = normalizeStatus(sp.status);
  const view = STATUS_VIEW[status];
  const Icon = view.icon;

  // 주문(스토어)은 완료 시 금액을 보여준다 — 소유 검증 겸.
  let amountLabel: string | null = null;
  let detailHref: string | null = null;
  let detailLabel = "주문 상세";
  let continueHref = "/products";

  if (sp.kind === "order" && sp.order) {
    const order = await getOrderByOrderNo(account.id, sp.order);
    if (order) {
      detailHref = `/orders/${order.orderNo}`;
      if (status === "paid") {
        amountLabel = `₩${order.totalAmount.toLocaleString()}`;
      }
    }
    continueHref = "/products";
  } else if (sp.kind === "trade" && sp.id) {
    // 매물 상세로 — 상세 페이지가 자체 접근 제어를 한다.
    detailHref = `/used/${sp.id}`;
    detailLabel = "거래 상세";
    continueHref = "/used";
  } else if (sp.kind === "bundle" && sp.id) {
    detailHref = `/used/bundle/${sp.id}`;
    detailLabel = "묶음 거래 상세";
    continueHref = "/used";
  }

  return (
    <div className="shop-page-frame space-y-6 py-10 text-center">
      <Icon className={`mx-auto h-14 w-14 ${view.iconClass}`} />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{view.title}</h1>
        <p className="text-sm text-muted-foreground">{view.desc}</p>
      </div>
      {amountLabel && <p className="text-lg font-bold">{amountLabel}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {detailHref && (
          <Button asChild variant={status === "paid" ? "outline" : "default"}>
            <Link href={detailHref}>{detailLabel}</Link>
          </Button>
        )}
        <Button asChild variant={status === "paid" ? "default" : "outline"}>
          <Link href={continueHref}>
            {status === "paid" ? "쇼핑 계속하기" : "돌아가기"}
          </Link>
        </Button>
      </div>
    </div>
  );
}
