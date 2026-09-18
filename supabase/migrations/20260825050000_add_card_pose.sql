-- add_card_pose: 포즈 번호 — 토레카분석기의 포즈 그룹 개념 도입.
-- 같은 (시리즈, 멤버) 안의 카드들은 각각 다른 '포즈'(다른 물리 카드)다.
-- 분석기는 임베딩 클러스터링으로 자동 부여하지만, 웹은 카드 행 자체가
-- 포즈 하나이므로 (시리즈·멤버) 내 등록 순서로 번호를 매긴다.

ALTER TABLE card
    ADD COLUMN pose INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN card.pose IS '포즈 번호 — 같은 (시리즈, 멤버) 내 1부터 순번';

-- 기존 카드 백필 — (시리즈, 멤버)별 id 순서대로 1, 2, 3…
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY series_id, member_id
               ORDER BY id
           ) AS rn
    FROM card
)
UPDATE card
SET pose = ranked.rn
FROM ranked
WHERE card.id = ranked.id;
