"use client";

import { useState } from "react";
import Script from "next/script";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// Daum 우편번호 서비스 — 무료·키 불필요. 스크립트를 lazy 로드하고 팝업으로 검색.
const DAUM_POSTCODE_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

type DaumPostcodeData = {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
};
type DaumPostcode = { open: () => void };
type DaumPostcodeConstructor = new (options: {
  oncomplete: (data: DaumPostcodeData) => void;
}) => DaumPostcode;

export function PostcodeSearchField({
  onComplete,
}: {
  onComplete: (result: { zipcode: string; baseAddress: string }) => void;
}) {
  const [ready, setReady] = useState(false);

  function openSearch() {
    const daum = (
      window as unknown as {
        daum?: { Postcode: DaumPostcodeConstructor };
      }
    ).daum;
    if (!daum) return;

    new daum.Postcode({
      oncomplete: (data) => {
        onComplete({
          zipcode: data.zonecode,
          // 도로명 우선, 없으면 지번.
          baseAddress: data.roadAddress || data.jibunAddress,
        });
      },
    }).open();
  }

  return (
    <>
      <Script
        src={DAUM_POSTCODE_SRC}
        strategy="lazyOnload"
        onLoad={() => setReady(true)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={openSearch}
        disabled={!ready}
      >
        <Search className="mr-1 h-4 w-4" />
        우편번호 검색
      </Button>
    </>
  );
}
