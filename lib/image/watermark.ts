import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

// 브랜드 워터마크 오버레이 — 타일링된 iroiro 워드마크 SVG를 생성한다.
// 저장(업로드) 시점에 한 번 이미지에 구워 넣는 용도(공통). 예전엔 /media 라우트가
// 요청마다 합성했으나(느림), 이제 등록 시 1회 합성하고 서빙은 정적으로 한다.
// 순수 오버레이만 만들고 합성은 호출부의 sharp 파이프라인이 담당한다(이중 인코딩 방지).

let wordmarkPromise: Promise<Buffer> | undefined;

function getWordmark(): Promise<Buffer> {
  wordmarkPromise ??= readFile(
    path.join(process.cwd(), "public/brand/iroiro-wordmark.png"),
  );
  return wordmarkPromise;
}

// 지정 크기(px)를 덮는 타일 워터마크 SVG. 대각선으로 반복 배치하고 살짝 회전·반투명.
export async function watermarkOverlaySvg(
  width: number,
  height: number,
): Promise<Buffer> {
  const wordmark = (await getWordmark()).toString("base64");
  const logoWidth = Math.max(150, Math.round(width * 0.34));
  const logoHeight = Math.round(logoWidth * 0.225);
  const stepX = Math.round(logoWidth * 1.16);
  const stepY = Math.round(logoHeight * 2.75);
  const logos: string[] = [];

  for (let y = -stepY; y < height + stepY; y += stepY) {
    for (let x = -stepX; x < width + stepX; x += stepX) {
      const offset = Math.floor(y / stepY) % 2 === 0 ? 0 : stepX / 2;
      logos.push(
        `<use href="#iroiro-wordmark" x="${x + offset}" y="${y}" opacity="0.24" transform="rotate(-24 ${x + offset + logoWidth / 2} ${y + logoHeight / 2})"/>`,
      );
    }
  }

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><image id="iroiro-wordmark" href="data:image/png;base64,${wordmark}" width="${logoWidth}" height="${logoHeight}"/></defs>${logos.join("")}</svg>`,
  );
}
