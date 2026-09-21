// 이미지 분석 결과 — 토레카분석기(oshikore-card) core/embedder.py 출력의 웹 대응물.
// 임베딩은 L2 정규화된 float 벡터이며, 코사인 유사도로 카드끼리 비교한다.

export type ImageAnalysis = {
  /** L2 정규화된 임베딩 벡터 (모델 차원, 기본 1024). */
  embedding: number[];
  /** 생성 모델·버전 (예: amazon.titan-embed-image-v1). 재분석/이관 판단용. */
  model: string;
};

/** 유사 카드 매칭 결과 한 건 (core/models.py MatchResult 대응). */
export type SimilarityMatch = {
  /** 후보 카드 id. */
  id: number;
  /** 코사인 유사도 (−1~1, 정규화 벡터라 사실상 0~1). */
  score: number;
};
