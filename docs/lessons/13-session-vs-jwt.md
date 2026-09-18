# 13. 세션 관리 — DB 세션 vs JWT

## 왜 알아야 하는가

오시코레는 **Supabase Auth(GoTrue)를 벗어나, 어떤 Postgres 위에서도 유효한 인증을 자체 구현**하기로 방향을 잡았다(2026-06-09 설계 논의). 그러려면 "로그인 상태를 *무엇으로* 기억하느냐" = **세션 모델**을 직접 골라야 한다.

HTTP는 stateless다 — 매 요청이 서로 독립이라, 한 번 로그인해도 다음 요청(장바구니 조회 등)은 그게 누구인지 모른다. 그래서 브라우저가 **쿠키**를 매 요청에 자동으로 실어 보내고, 서버는 그 쿠키로 사용자를 다시 식별한다. 질문은 단 하나: **쿠키 안에 무엇이 들었고, 서버는 그에 맞춰 무엇을 저장하느냐.**

이 선택(JWT vs DB 세션)이 **폐기(revocation)·탈취 대응·서버리스 적합성·구현 난이도**를 전부 좌우한다. 잘못 고르면 "계정 도용을 탐지해도 손을 못 쓰는" 상황이 생긴다.

> [!note] 이 문서의 위치
> 세션 모델 자체(개념·비교)는 정착된 지식이라 레슨으로 남긴다. *어떤 인증 라이브러리를 쓸지·RLS를 어떻게 재설계할지* 같은 미확정 설계 결정은 별도 스펙으로 다룬다. 서버리스 환경에서의 적용은 [14. 서버리스 세션과 Next 16 Proxy/DAL](./14-serverless-session-and-proxy.md) 참고.

## 핵심 개념

### 세션을 기억하는 방식은 셋, 그중 둘만 현실적

| 방식 | 쿠키에 든 것 | 서버가 저장하는 곳 | 검증 방법 |
|---|---|---|---|
| **JWT (무상태)** | 서명된 신원 토큰 `{userId, exp}` | **아무 데도 저장 안 함** | 서명만 검증(시크릿/공개키) |
| **DB 세션** | 무작위 티켓 문자열(신원 없음) | `account_session` **테이블 행** | 티켓으로 행 조회 |
| ~~인메모리~~ | 무작위 티켓 | 서버 프로세스 **RAM** | RAM 맵 조회 → **서버리스서 깨짐, 배제** |

핵심 차이는 **"신뢰를 어디서 얻느냐"**다.

- **JWT** = *서명으로* 신뢰. 서버가 아무것도 저장하지 않고, 쿠키 속 토큰의 서명만 검증해 "이건 내가 발급한 진짜다"를 확인한다.
- **DB 세션** = *조회로* 신뢰. 쿠키엔 무작위 티켓만 있고, 매번 테이블에서 그 티켓을 찾아 "이 세션 살아있네"를 확인한다.

> **DB 세션에 "마법 메모리 영역"은 없다.** 세션이 곧 진짜 테이블의 한 행(row)이다. RAM에 두는 방식(인메모리)이야말로 서버리스에서 깨지므로 **배제**한다. 자세한 이유는 [14번](./14-serverless-session-and-proxy.md).

## 코드/문법

### DB 세션 한 사이클

**로그인 시:**
1. 서버가 무작위 문자열 생성 — 예: `a8f3c1…` (신원 정보 없는 *티켓 번호*)
2. `account_session`에 행 INSERT: `{ id: hash(a8f3c1…), account_id, expires_at }`
3. 그 무작위 문자열을 **httpOnly·Secure·SameSite 쿠키**로 브라우저에 전달

**다음 요청 시:**
1. 브라우저가 쿠키(`a8f3c1…`)를 자동 전송
2. 서버: `SELECT account_id FROM account_session WHERE id = hash(쿠키값) AND expires_at > now()`
3. 행 있음 → 사용자 확정 / 없거나 만료 → 미인증

토큰은 **해시해서 저장**한다(DB 유출 시 원본 토큰 복원 불가). 쿠키엔 신원이 0이고, 신원은 전적으로 테이블 행이 들고 있다.

### 잠정 스키마 스케치 (확정 아님)

```sql
-- account_session : DB 세션. 토큰은 해시 저장, expires_at로 자연 만료.
CREATE TABLE account_session (
    id          TEXT        PRIMARY KEY,          -- 세션 토큰의 해시
    account_id  UUID        NOT NULL REFERENCES account(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,             -- 자연 만료 시각
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX account_session_account_idx ON account_session (account_id);  -- 전 기기 로그아웃용
```

### JWT 검증 (비교용)

```ts
// 저장소 없음. 시크릿으로 서명만 검증.
const { payload } = await jwtVerify(cookieToken, secret, { algorithms: ["HS256"] });
// payload.userId 신뢰. DB 조회 없음.
```

## 비교 표

| 차원 | JWT (무상태) | DB 세션 |
|---|---|---|
| 서버 저장 | **없음** | `account_session` 테이블 행 |
| 요청당 DB 조회 | ❌ 불필요 | ✅ PK 1회(인덱스, 사실상 무료) |
| **즉시 폐기/로그아웃** | ❌ 어려움 — exp까지 유효, 서버가 죽일 방법 없음 | ✅ 행 DELETE = 즉사 |
| **전 기기 로그아웃** | ❌ 사실상 불가(denylist 별도 구축) | ✅ `account_id`의 모든 행 DELETE |
| Edge에서 검증 | ✅ 가능(jose/Web Crypto, DB 불필요) | ❌ 불가(Postgres TCP 필요) → Node 계층에서 |
| 토큰에 신원 노출 | ⚠️ payload는 **서명만, 암호화 아님** → 누구나 base64 디코드. PII 금지 | 쿠키엔 무작위 티켓뿐, 신원 0 |
| 시크릿 유출 시 | 💥 **전 사용자 위조** + 시크릿 교체 = 전원 강제 로그아웃 | 영향 국소적(토큰은 해시 저장) |
| 직접 구현 난이도 | ⚠️ 지뢰 많음(`alg:none`·약한 시크릿·exp 미검증·localStorage 저장) | 비교적 단순(무작위 생성→해시→저장→조회) |
| 수평 확장 | ✅ 검증에 공유 상태 불필요 | DB가 공유점(이미 Postgres 공유 중이라 무의미) |

## 탈취 시나리오 — *무엇이* 탈취됐느냐가 관건

흔한 오해: *"JWT는 탈취돼도 유효시간 지나면 자연 복구되는데, DB 세션은 로그아웃 눌러야만 끝난다."* — **둘 다 틀렸다.** DB 세션도 `expires_at`로 자연 만료하고, JWT의 "자연 복구"는 *access 토큰만* 샜을 때만 성립한다.

| 탈취된 것 | JWT + refresh | DB 세션 |
|---|---|---|
| **access 토큰만**(단기, 예: 15분) | ✅ 15분 뒤 자동 무효 — 피해창 짧음 | 세션 토큰이 곧 지속 자격이라 만료까지 유효(단 idle timeout으로 단축 가능) |
| **refresh 토큰**(지속 자격) | ❌ 만료까지 **무한 재발급** → DB에서 revoke해야 멈춤 | ❌ 만료/revoke까지 유효 |
| 폐기 대응 | refresh를 DB에서 삭제 = **세션 삭제와 동일 연산** | 행 DELETE = 즉사 |

**웹 쿠키 기반에선 access·refresh가 보통 같은 쿠키 묶음**이라, XSS·쿠키 탈취가 둘 다 가져간다. 그 순간 공격자는 refresh로 새 access를 계속 찍어내므로 "15분 뒤 복구"가 오지 않는다. **refresh가 새면 결국 DB에서 죽여야 하고, 그건 DB 세션을 죽이는 것과 똑같은 작업이다.**

JWT의 "짧은 만료로 때운다"는 사실 **폐기를 못 하니까** 택한 보상책이다. access 토큰은 그 15분 동안 **무슨 수를 써도 못 죽인다** — 도용을 탐지해도 손을 못 쓴다. DB 세션은 탐지 즉시 끝낼 수 있다. **탈취 *대응* 면에선 DB 세션이 오히려 더 강하다.**

## 만료와 폐기 — cron이 필요한가?

- **보안용으론 불필요.** `expires_at`가 지나면 읽기 시점(`WHERE expires_at > now()`)에서 자동 거부된다. 만료된 세션은 물리적으로 행이 남아있어도 이미 "죽은" 상태다. → **만료에 별도 로직이 안 들어간다.**
- **정리용 cron은 선택(housekeeping).** 죽은 행이 쌓여 테이블이 붓는 걸 막는 가비지 컬렉션일 뿐 보안 요구사항이 아니다. 예: 하루 한 번 `DELETE FROM account_session WHERE expires_at < now()`.

### 노출창을 짧게 — sliding/idle 만료

- **절대 만료**: 생성 후 30일 고정.
- **슬라이딩**: 쓸 때마다 만료 연장(+absolute cap) — "로그인 유지"가 이 방식. Lucia 패턴은 수명 절반을 넘기면 자동 연장한다.
- **idle timeout**: 무활동 N시간 후 만료 — 민감 앱에서 노출창을 짧게.

즉 "JWT처럼 짧은 창"이 필요하면 DB 세션도 idle timeout으로 구현되고, 거기에 **즉시 폐기**가 공짜로 따라온다.

## 이 프로젝트의 결정

**1차 사용자 세션 = DB 세션(Lucia식 서버 세션)** (2026-06-09 논의, 구현 전 설계 단계).

근거:
1. **즉시 폐기·전 기기 로그아웃**이 실질 요구사항 — 주문·결제를 다루는 B2C 커머스라 계정 도용·비밀번호 변경 시 세션 즉살이 필요. JWT access 토큰엔 없는 능력.
2. **이미 Postgres가 요청 경로에 있다** — 카탈로그(team/product)가 Prisma+pg로 매 요청 DB를 조회한다([`lib/db.ts`](../../lib/db.ts)). `account_session`은 *또 하나의 테이블*일 뿐, 인프라적으로 새로운 게 없다.
3. **손수 만들 때 안전하다** — 인증을 완전 자체 구현하기로 했는데(라이브러리 미사용), JWT는 암호학적 지뢰가 많은 반면 DB 세션은 "무작위→해시→저장→조회"라 안전하게 짜기 쉽다.
4. **JWT의 edge 검증 이점이 희석된다** — Next 16은 인증 판정을 데이터 옆(DAL)에서 하라고 못박았다([14번](./14-serverless-session-and-proxy.md)).

JWT/하이브리드는 **나중에 서비스를 쪼개거나 stateless 교차검증이 필요해지면** 그때 도입해도 늦지 않다. 그땐 refresh 토큰 테이블이 지금 만들 `account_session`의 확장이 된다.

## 함정·주의

- **인메모리 세션은 서버리스에서 깨진다** — 매 요청이 빈 RAM의 새 인스턴스에 떨어진다. 그래서 배제한다. ([14번](./14-serverless-session-and-proxy.md) 참고)
- **JWT payload는 암호화가 아니라 서명**이다(JWS) — base64 디코드로 누구나 내용을 읽는다. 비밀·PII를 넣지 말 것.
- **`alg:none`/알고리즘 혼동 공격** — JWT를 손수 검증할 때 허용 알고리즘을 *명시적으로 고정*해야 한다. 라이브러리 기본값을 믿지 말 것.
- **순수 JWT는 현실에서 잘 안 남는다** — 로그아웃을 제대로 하려면 단기 access JWT + DB refresh(=하이브리드)로 가고, 그 refresh 테이블은 사실상 DB 세션 테이블과 같다. "JWT 쓰면 테이블 없다"는 끝까지 가면 거짓.
- **하이브리드를 *안전하게* 하려면 더 복잡** — refresh 탈취를 막으려면 **refresh token rotation + 재사용 탐지**(OAuth 2.0 BCP)가 정석: 매 갱신마다 새 refresh 발급·이전 것 무효화, 폐기된 refresh가 다시 들어오면 = 탈취 신호 → 토큰 계보 전체 revoke. 계보를 DB에 저장해야 하고 손으로 짜기 까다롭다.
- **우리는 이미 JWT(하이브리드)를 써봤다** — Supabase Auth가 그 모델(access JWT + 서버 저장 refresh)이고 `auth.uid()`가 그 JWT의 `sub`를 읽었다. 지금 논의는 *그걸 손수 만들 거냐 vs 더 단순한 DB 세션이냐*였다.
- **쿠키 플래그 필수** — 세션·토큰 쿠키는 항상 `httpOnly`·`Secure`·`SameSite`. localStorage 저장 금지(XSS 표적).

## 참고

- [14. 서버리스 세션과 Next 16 Proxy/DAL](./14-serverless-session-and-proxy.md) — 서버 인스턴스 없이 DB 세션이 되는 이유와 검증 계층
- [11. Vercel Function Region](./11-vercel-function-region.md) — Edge vs Node 런타임, function region
- [`docs/architecture/auth-and-data.md`](../architecture/auth-and-data.md) — 인증·데이터 룰
- [Next.js — Authentication (Sessions: Stateless vs Database)](https://nextjs.org/docs/app/guides/authentication#session-management) (로컬: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`)
- [Lucia — Sessions](https://lucia-auth.com/sessions/overview) — DB 세션 레퍼런스 패턴(라이브러리는 디프리케이트, 레퍼런스로 활용)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/rfc9700) — refresh token rotation·재사용 탐지
