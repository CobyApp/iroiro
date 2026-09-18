import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// 통합 테스트의 픽스처 정리 전용 특권 연결.
//
// 앱 런타임은 비특권 `app` 롤로 접속하고, 그 GRANT에는 post·post_comment·account의
// DELETE가 없다(soft delete 강제 — docs/architecture/db-authorization-review.md).
// 검증 대상인 앱 코드는 그 제약 아래에서 돌아야 하지만, 테스트 픽스처를 치우려면
// hard delete가 필요하다. 그래서 **정리에만** 소유자 연결을 쓴다.
//
// 이 분리를 하지 않고 app 롤로 정리하면 "permission denied"로 테스트가 죽고,
// 반대로 테스트 전체를 소유자로 돌리면 GRANT 검증 가치가 사라진다.
//
// 접속 문자열은 DATABASE_URL에서 자격증명만 바꿔 파생한다 — 호스트·포트를 중복 정의하지 않고,
// 소스에 접속 문자열 리터럴을 두지 않기 위함(secretlint).
function privilegedUrl(): string {
  const explicit = process.env.DATABASE_URL_PRIVILEGED;
  if (explicit) return explicit;

  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL이 없습니다 — 통합 테스트는 .env.local이 필요합니다");
  const url = new URL(base);
  url.username = "postgres";
  url.password = "postgres"; // 로컬 Supabase 고정 자격 (공개 개발 디폴트)
  return url.toString();
}

let client: PrismaClient | null = null;

/** 픽스처 정리용 특권 클라이언트 — 앱 코드 검증에는 쓰지 말 것. */
export function privilegedDb(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: privilegedUrl() }),
  });
  return client;
}

export async function disconnectPrivilegedDb(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
