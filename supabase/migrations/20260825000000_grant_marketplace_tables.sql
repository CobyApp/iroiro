-- 중고거래·시리즈 테이블 GRANT 누락 보정 — 20260824100000(시리즈)·110000(중고거래)
-- 마이그레이션이 테이블만 만들고 app 롤 GRANT를 빠뜨려, 배포 앱(app 롤)이
-- "permission denied for table site_setting"(42501)로 빌드 프리렌더에서 실패.
-- (IDENTITY 컬럼은 시퀀스 GRANT 불필요 — init_catalog.sql 주석 참조)

-- 시리즈 카탈로그: 조회 + 동기화 시 자동 생성. 수정·삭제 없음.
GRANT SELECT, INSERT ON series TO app;

-- 사이트 설정 싱글턴: 조회 + 관리자 upsert(INSERT/UPDATE).
GRANT SELECT, INSERT, UPDATE ON site_setting TO app;

-- 중고 매물: 등록 + 상태·현재가 갱신. 삭제 대신 status='canceled'.
GRANT SELECT, INSERT, UPDATE ON used_listing TO app;

-- 매물 사진: 등록 + 대표 지정 변경(is_primary UPDATE).
GRANT SELECT, INSERT, UPDATE ON used_listing_photo TO app;

-- 중고 입찰 원장: append-only — 조회·기록만.
GRANT SELECT, INSERT ON used_bid TO app;

-- 중고 거래: 생성 + 진행 상태·QR·운송장 갱신. 삭제 대신 status='canceled'.
GRANT SELECT, INSERT, UPDATE ON used_trade TO app;
