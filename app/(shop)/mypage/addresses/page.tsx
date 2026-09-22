import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAccount } from "@/modules/auth/dal";
import { loginRequiredHref } from "@/modules/auth/lib/login-required";
import { ShopPageHeader } from "@/modules/ui/components/ShopPageHeader";
import { listAddresses } from "@/modules/addresses/lib/queries";
import { AddressBook } from "@/modules/addresses/components/AddressBook";

export const metadata: Metadata = { title: "주소록" };

// 주소록 관리 — 자주 쓰는 배송지 저장·기본 지정.
export default async function AddressesPage() {
  const account = await getCurrentAccount();
  if (!account) redirect(loginRequiredHref("profile"));

  const addresses = await listAddresses(account.id);

  return (
    <div className="shop-page-frame space-y-6">
      <ShopPageHeader
        eyebrow="ADDRESS BOOK"
        title="주소록"
        description="자주 쓰는 배송지를 저장해 두고 주문할 때 바로 골라 쓰세요."
      />
      <section className="shop-content-surface">
        <AddressBook addresses={addresses} />
      </section>
    </div>
  );
}
