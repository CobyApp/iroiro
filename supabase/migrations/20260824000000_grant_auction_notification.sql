-- 경매·알림 테이블 GRANT 누락 보정 — 20260821000000(경매)·010000(알림)·020000(푸시)
-- 마이그레이션이 테이블만 만들고 app 롤 GRANT를 빠뜨려, 배포 앱(app 롤)이
-- "permission denied for table auction_bid"(42501)로 경매 상품 상세에서 500.
-- (IDENTITY 컬럼은 시퀀스 GRANT 불필요 — init_catalog.sql 주석 참조)

-- 입찰 원장: append-only — 앱은 조회·기록만.
GRANT SELECT, INSERT ON auction_bid TO app;

-- 알림: 생성 + 읽음 처리(read_at UPDATE). 삭제는 없음.
GRANT SELECT, INSERT, UPDATE ON notification TO app;

-- 푸시 구독: upsert(INSERT/UPDATE) + 만료·해지 정리(DELETE).
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscription TO app;
