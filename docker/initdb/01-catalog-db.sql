-- compose.yaml postgres 최초 기동 시(빈 볼륨) 한 번 실행 — 카탈로그 DB 를 커머스 DB 와 별도로 만든다.
-- 운영에서 dev·prd 가 공유하는 iroiro_catalog 와 같은 이름. 스키마는 `npm run db:reset` 이 적용한다.
CREATE DATABASE iroiro_catalog;
