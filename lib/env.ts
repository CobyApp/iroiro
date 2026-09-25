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
    // 카탈로그(토레카 마스터) 이미지 버킷 — 환경별로 분리한다(iroiro-kr-catalog-<env>).
    // cards/wm/ 만 버킷 정책으로 공개(고객 화면), cards/clean/ 은 비공개(관리자 라우트 /media/catalog-clean 이 프록시).
    // 자격증명은 R2_* 를 공유(setup.sh catalog 가 앱 IAM 사용자에 버킷 권한 부여).
    CATALOG_BUCKET: z.string().min(1).default("iroiro-catalog-dev"),
    CATALOG_PUBLIC_BASE: z
      .string()
      .url()
      .default("http://localhost:9000/iroiro-catalog-dev"),
    // 결제 게이트웨이 어댑터 선택. 실 PG 도입 시 enum에 "toss" 등 추가 + lib/payments 어댑터 구현.
    // kakaopay = 중고 안전거래 리다이렉트 결제. KAKAO_PAY_SECRET_KEY 가 없으면 런타임이
    // mock(즉시 결제)으로 폴백하므로 키 없이도 CI·로컬에서 안전하게 동작한다.
    PAYMENT_PROVIDER: z.enum(["mock", "kakaopay"]).default("mock"),
    // 카카오페이 단건결제 CID. 기본값은 카카오 공식 테스트 CID(TC0ONETIME) — 실 계약 전까지 사용.
    KAKAO_PAY_CID: z.preprocess(
      emptyToUndefined,
      z.string().min(1).default("TC0ONETIME"),
    ),
    // 카카오페이 Secret key(dev/prod). 선택 — 미설정이면 kakaopay 선택이어도 mock 으로 폴백.
    // 실제 키는 SSM(운영)에만 두고 코드/리포지토리에는 넣지 않는다(secretlint).
    KAKAO_PAY_SECRET_KEY: optionalString,
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
    // 카카오맵 JavaScript 키(중고 직거래 만날 장소 지도). 환경별 다른 앱 키 — 런타임 SSM 주입.
    // 서버가 읽어 클라이언트에 prop 으로 내려준다(빌드 인라인 아님). 미설정 시 지도는 목록 폴백.
    KAKAO_MAP_JS_KEY: optionalString,
    // 매입일 환율(JPY→KRW) 조회 API. 기본 Frankfurter(ECB, 키 불필요, 과거 영업일 지원).
    // 정식 호스트는 api.frankfurter.dev/v1 (.app은 301 리다이렉트).
    FX_API_BASE: z.preprocess(
      emptyToUndefined,
      z.string().url().default("https://api.frankfurter.dev/v1"),
    ),
    // 카드 이미지 분석(AWS Bedrock Titan Multimodal Embeddings) — 등록 시 앞면을
    // 임베딩해 유사 카드 매칭에 쓴다(토레카분석기 embedder의 AWS 포팅). 전부 선택 —
    // 미설정이면 분석만 조용히 비활성(카드 등록 자체는 정상 동작, lib/vision §isVisionConfigured).
    // 리전만 있으면 활성화된다. 자격증명은 (1) 아래 정적 키가 있으면 그것, 없으면
    // (2) AWS 표준 자격증명 체인(로컬은 BEDROCK_PROFILE 프로필, 운영은 ECS 태스크 역할)에서
    // 런타임에 해석한다 — 시크릿을 .env에 적지 않아도 된다(lib/vision/client.ts).
    BEDROCK_REGION: optionalString,
    // 정적 키(선택) — 자격증명 체인을 쓰지 않고 직접 지정할 때만.
    BEDROCK_ACCESS_KEY_ID: optionalString,
    BEDROCK_SECRET_ACCESS_KEY: optionalString,
    // 자격증명 체인이 읽을 ~/.aws 프로필 이름(로컬 개발용, 예: coby). 미설정이면 기본 해석 순서.
    BEDROCK_PROFILE: optionalString,
    // 임베딩 모델 ID·차원. 기본은 Titan Image Embeddings v1(256/384/1024 지원).
    BEDROCK_EMBED_MODEL_ID: z.preprocess(
      emptyToUndefined,
      z.string().min(1).default("amazon.titan-embed-image-v1"),
    ),
    BEDROCK_EMBED_DIMENSION: z.coerce.number().int().positive().default(1024),
  });

export const env = envSchema.parse(process.env);

// 이미지 분석 활성화 조건 = 리전 설정. 자격증명은 런타임에 정적 키 또는 자격증명 체인에서
// 해석하며(lib/vision/client.ts), 해석 실패 시 분석만 조용히 건너뛴다(fail-soft).
export const isVisionConfigured = Boolean(env.BEDROCK_REGION);
