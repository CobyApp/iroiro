// 임베딩 벡터 앞부분을 막대 스파크라인으로 — 값이 어떤 분포인지 한눈에(양수 accent, 음수 primary).
// 순수 SVG, 서버·클라이언트 공용.
export function EmbeddingSparkline({
  values,
  height = 56,
  className,
}: {
  values: number[];
  height?: number;
  className?: string;
}) {
  if (values.length === 0) return null;
  const width = values.length * 4;
  const peak = Math.max(...values.map((v) => Math.abs(v)), 1e-6);
  const mid = height / 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`임베딩 앞 ${values.length}차원 미리보기`}
      className={className}
    >
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="currentColor" strokeOpacity="0.15" />
      {values.map((v, i) => {
        const h = (Math.abs(v) / peak) * (mid - 2);
        return (
          <rect
            key={i}
            className="embedding-bar"
            data-negative={v < 0}
            x={i * 4 + 0.5}
            y={v >= 0 ? mid - h : mid}
            width={3}
            height={Math.max(h, 0.5)}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
