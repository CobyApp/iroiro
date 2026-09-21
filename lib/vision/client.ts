import "server-only";

import { AwsClient } from "aws4fetch";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { env, isVisionConfigured } from "@/lib/env";

// AWS Bedrock Runtime 클라이언트 — lib/r2/client.ts처럼 aws4fetch로 SigV4 서명만 한다.
// 자격증명은 두 경로 중 하나로 해석한다:
//   1) 명시적 정적 키(BEDROCK_ACCESS_KEY_ID/SECRET)가 있으면 그것을 쓴다.
//   2) 없으면 AWS 표준 자격증명 체인(env → ~/.aws profile → SSO → ECS 태스크 역할 …)에서
//      해석한다. 로컬은 BEDROCK_PROFILE(예: coby) 프로필, 운영(ECS)은 태스크 역할이 자동으로 잡힌다.
// → 시크릿을 .env에 적지 않아도 되고, 운영/로컬이 같은 코드로 동작한다.

// 체인은 provider를 재호출하면 만료된 임시 자격증명을 갱신한다. 한 번 만들어 재사용한다.
const credentialProvider =
  env.BEDROCK_ACCESS_KEY_ID && env.BEDROCK_SECRET_ACCESS_KEY
    ? async () => ({
        accessKeyId: env.BEDROCK_ACCESS_KEY_ID!,
        secretAccessKey: env.BEDROCK_SECRET_ACCESS_KEY!,
        sessionToken: undefined as string | undefined,
      })
    : fromNodeProviderChain(
        env.BEDROCK_PROFILE ? { profile: env.BEDROCK_PROFILE } : {},
      );

// 요청 시점에 자격증명을 해석해 서명 클라이언트를 만든다(임시 자격증명 갱신 대응).
// 리전 미설정이거나 자격증명 해석 실패면 null → 호출부가 분석을 건너뛴다(fail-soft).
export async function getBedrockClient(): Promise<AwsClient | null> {
  if (!isVisionConfigured) return null;
  try {
    const creds = await credentialProvider();
    if (!creds.accessKeyId || !creds.secretAccessKey) return null;
    return new AwsClient({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      service: "bedrock",
      region: env.BEDROCK_REGION!,
    });
  } catch {
    return null;
  }
}

// InvokeModel 엔드포인트. modelId는 경로에 URL-인코딩해 넣는다.
export function bedrockInvokeUrl(modelId: string): string {
  return `https://bedrock-runtime.${env.BEDROCK_REGION}.amazonaws.com/model/${encodeURIComponent(
    modelId,
  )}/invoke`;
}
