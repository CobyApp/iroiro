import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// BigInt JSON 직렬화 polyfill — Server Action·RSC boundary에서 자동 처리.
// 우리 도메인 ID range는 Number safe integer 안이라 Number 변환 안전.
type BigIntWithJson = bigint & { toJSON(): number };
if (!(BigInt.prototype as BigIntWithJson).toJSON) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function (this: bigint) {
      return Number(this);
    },
    writable: true,
    configurable: true,
  });
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prismaClientSingleton = () => new PrismaClient({ adapter });

declare const globalThis: {
  __prismaGlobal?: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

export const db = globalThis.__prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaGlobal = db;
}
