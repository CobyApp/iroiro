// 우체국 QR 목업 — 등기번호 기반 격자 패턴(실 연동 전 화면 흐름 확인용).
// UsedDetailCta(단건 거래)·BundleProgress(묶음 거래)가 함께 쓴다.
export function MockQr({ code }: { code: string }) {
  const cells = code
    .split("")
    .flatMap((ch, i) => [ch.charCodeAt(0) * 31 + i, ch.charCodeAt(0) * 17 + i * 3]);
  return (
    <div className="mx-auto w-fit rounded-sm border border-border bg-white p-3">
      <div className="grid grid-cols-12 gap-0.5">
        {Array.from({ length: 144 }, (_, i) => (
          <span
            key={i}
            className={
              (cells[i % cells.length] + i * 7) % 3 === 0
                ? "h-2 w-2 bg-black"
                : "h-2 w-2 bg-white"
            }
          />
        ))}
      </div>
      <p className="mt-2 text-center font-mono text-xs text-black">{code}</p>
    </div>
  );
}
