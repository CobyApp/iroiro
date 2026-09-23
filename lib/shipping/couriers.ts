// 택배사 목록 + 무료 배송조회 링크. 유료 API 없이 판매자/관리자가 실제 송장번호를 입력하면,
// 각 택배사 공개 조회 페이지로 바로 링크한다(비용 0). URL 패턴은 택배사가 바꿀 수 있어 유지보수 대상.

export type CourierCode =
  | "epost"
  | "cj"
  | "hanjin"
  | "lotte"
  | "logen"
  | "gspostbox"
  | "cupost"
  | "etc";

type Courier = {
  code: CourierCode;
  name: string;
  /** 송장번호로 조회 URL 생성. 링크 미지원(기타)이면 null. */
  track: (trackingCode: string) => string | null;
};

export const COURIERS: Courier[] = [
  {
    code: "cj",
    name: "CJ대한통운",
    track: (c) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${c}`,
  },
  {
    code: "epost",
    name: "우체국택배",
    track: (c) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${c}`,
  },
  {
    code: "hanjin",
    name: "한진택배",
    track: (c) =>
      `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${c}`,
  },
  {
    code: "lotte",
    name: "롯데택배",
    track: (c) =>
      `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${c}`,
  },
  {
    code: "logen",
    name: "로젠택배",
    track: (c) => `https://www.ilogen.com/m/personal/trace/${c}`,
  },
  {
    code: "gspostbox",
    name: "GS편의점택배(반값)",
    track: (c) => `https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no=${c}`,
  },
  {
    code: "cupost",
    name: "CU편의점택배",
    track: (c) => `https://www.cupost.co.kr/postbox/delivery/local.cupost?invoice_no=${c}`,
  },
  {
    code: "etc",
    name: "기타",
    track: () => null,
  },
];

const BY_CODE = new Map(COURIERS.map((c) => [c.code, c]));

export function isCourierCode(value: string): value is CourierCode {
  return BY_CODE.has(value as CourierCode);
}

export function courierLabel(code: string | null): string {
  if (!code) return "택배";
  return BY_CODE.get(code as CourierCode)?.name ?? code;
}

/** 무료 조회 링크 — 택배사·송장번호로 공개 조회 페이지 URL. 없으면 null(번호만 표시). */
export function courierTrackingUrl(
  code: string | null,
  trackingCode: string | null,
): string | null {
  if (!code || !trackingCode) return null;
  const courier = BY_CODE.get(code as CourierCode);
  if (!courier) return null;
  return courier.track(encodeURIComponent(trackingCode));
}
