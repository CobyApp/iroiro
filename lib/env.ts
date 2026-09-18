import "server-only";

import { z } from "zod";

// .env.local.example을 복사하면 "KEY=" 가 빈 문자열("")로 로드된다. ""는 .optional()에
// 걸리지 않아 .min(1)/.url()에서 실패한다(호스팅 빌드의 ZodError 원인). 선택 필드는
// 빈 문자열을 미설정(undefined)으로 정규화해, "값 없음" 관례를 올바르게 처리한다.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z
  .object({
    R2_ENDPOINT: z.string().url().default("http://localhost:9000"),
    // S3 호환 엔드포인트의 서명 리전. R2/MinIO는 "auto", AWS S3는 버킷 리전.
    R2_REGION: z.preprocess(emptyToUndefined, z.string().min(1).default("auto")),
    R2_ACCESS_KEY_ID: z.string().min(1).default("minioadmin"),
    R2_SECRET_ACCESS_KEY: z.string().min(1).default("minioadmin"),
    R2_BUCKET: z.string().min(1).default("iroiro-products-dev"),
    R2_PUBLIC_BASE: z
      .string()
      .url()
      .default("http://localhost:9000/iroiro-products-dev"),
    // UGC 전용 비공개 버킷(§결정 8) — products 공개 버킷과 분리. 서빙은 서명 GET만.
    // 자격증명은 상품용 R2_*를 공유한다(2026-08-02) — 운영 토큰 스코프에 이 버킷도 포함할 것.
    R2_UGC_BUCKET: z.string().min(1).default("iroiro-ugc-dev"),
    // 결제 게이트웨이 어댑터 선택. 실 PG 도입 시 enum에 "toss" 등 추가 + lib/payments 어댑터 구현.
    PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
    // 웹 푸시(VAPID) — 미설정이면 푸시 발송만 조용히 비활성(인앱 알림은 동작).
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString,
    // OAuth 자체 인증. 제공자 자격증명은 필수(required) — 누락 시 env parse가 실패해
    // 빌드/부팅 단계에서 즉시 드러난다(휴면 배포 방지, fail-fast).
    APP_URL: optionalUrl, // 선택: 미설정 시 라우트가 요청 origin으로 폴백
    KAKAO_REST_API_KEY: z.string().min(1), // 필수
    // 선택: 카카오는 클라이언트 시크릿 없이도 동작(콘솔에서 시크릿 사용 ON일 때만 필요).
    KAKAO_CLIENT_SECRET: optionalString,
    // 선택: 동의항목(scope). 기본 profile_nickname. 이메일은 비즈앱+"profile_nickname,account_email".
    KAKAO_SCOPE: optionalString,
    NAVER_CLIENT_ID: z.string().min(1), // 필수 (네이버는 ID·시크릿 둘 다 필요)
    NAVER_CLIENT_SECRET: z.string().min(1), // 필수
    // 외부 Cutie Card 분석기 API (card.taba.asia) — 관리자 카드 임포트용. 서버 전용(키 노출 X).
    CUTIE_CARD_API_BASE: z.preprocess(
      emptyToUndefined,
      z.string().url().default("https://card.taba.asia"),
    ),
    CUTIE_CARD_API_KEY: optionalString,
    // 매입일 환율(JPY→KRW) 조회 API. 기본 Frankfurter(ECB, 키 불필요, 과거 영업일 지원).
    // 정식 호스트는 api.frankfurter.dev/v1 (.app은 301 리다이렉트).
    FX_API_BASE: z.preprocess(
      emptyToUndefined,
      z.string().url().default("https://api.frankfurter.dev/v1"),
    ),
  });

export const env = envSchema.parse(process.env);
