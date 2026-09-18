# 10. Database URL 비밀번호 인코딩

## 왜 알아야 하는가

Prisma가 읽는 `DATABASE_URL`은 **비밀번호가 박힌 URL 한 줄**입니다. 이 프로젝트의 운영값은 SSM Parameter Store `/iroiro/<env>/DATABASE_URL`에 있고 ECS 태스크가 기동 시 주입합니다.

<!-- secretlint-disable -->
```
postgresql://app:<password>@iroiro-<env>.<id>.ap-northeast-2.rds.amazonaws.com:5432/iroiro?sslmode=verify-full&sslrootcert=/app/rds-ca.pem
```
<!-- secretlint-enable -->

비밀번호에 특수문자가 들어가면, 겉보기엔 URL 같지만 Node.js의 WHATWG URL 파서(`new URL`)가 reserved character를 *다른 구조 분리자*로 해석하면서 깨집니다. Prisma 7의 `@prisma/adapter-pg`는 connection string을 받으면 내부에서 `new URL()`을 호출하므로, 첫 쿼리 호출 시점에 표면화됩니다.

> **이력.** 이 프로젝트도 첫 배포(당시 Vercel + Supabase, 2026-05-23)에서 비밀번호의 `#`을 그대로 환경 변수에 넣어 `PrismaClientKnownRequestError: Invalid URL`(`code: ERR_INVALID_URL`, `modelName: Team`)을 만났습니다. 호스팅은 바뀌었지만 파서는 같으므로 규칙은 그대로 유효합니다.

## 핵심 개념

### URL의 reserved character (RFC 3986)

URL 표준은 *구조 분리자로 사용*되는 문자를 reserved로 정의합니다. password 영역에 이들이 들어가면 percent-encoding(`%XX`) 필수.

| 분류 | 문자 | 영역 의미 |
|---|---|---|
| **gen-delims** (가장 위험) | `:` `/` `?` `#` `[` `]` `@` | 각각 user/password 구분, path 시작, query 시작, fragment 시작, IPv6 host, userinfo 종료 |
| **sub-delims** | `!` `$` `&` `'` `(` `)` `*` `+` `,` `;` `=` | RFC 상 userinfo 허용이지만 일부 드라이버는 보수적 |
| **`%`** | `%` | percent-encoding 자체의 시작 표시. literal로 쓰려면 `%25` |
| **unreserved** (어디든 안전) | `A-Z` `a-z` `0-9` `-` `.` `_` `~` | percent-encoding 불필요 |

### 우리 URL엔 query가 붙는다 — `?`·`&`·`=`가 구조 문자

RDS 접속 문자열은 `?sslmode=verify-full&sslrootcert=/app/rds-ca.pem`를 달고 있습니다. 즉 `?`는 query 시작, `&`는 파라미터 구분, `=`는 키-값 구분으로 **이미 쓰이고 있는** 문자입니다. 비밀번호에 `?`가 있으면 그 뒤가 전부 query로 잘려 host가 깨지고, `&`·`=`는 파서는 통과해도 사람이 눈으로 검증할 때 헷갈립니다. `sslrootcert` 값의 `/`는 query 안이라 안전하지만, 같은 `/`가 비밀번호에 있으면 즉시 깨집니다 — **같은 문자가 어느 영역에 있느냐**가 전부입니다.

### WHATWG URL 파서의 *관용적 처리* — 의존하면 안 되는 자리

Node.js의 `new URL()`은 WHATWG URL Standard를 따릅니다. 실제 동작은 두 가지로 갈립니다.

**파싱 단계에서 즉시 실패하는 문자** — `ERR_INVALID_URL`:

| 문자 | 파서 해석 | 결과 |
|---|---|---|
| `#` | fragment 시작 → host가 비어버림 | **즉시 throw** |
| `/` | path 시작 → userinfo 종료 안 됨 | **즉시 throw** |

**파싱은 통과하지만 password 값이 *암묵적으로 변형*되는 문자**:

| 문자 | 변형 결과 |
|---|---|
| `@` | password에 `%40`으로 자동 인코딩 (파서가 마지막 `@`를 host 구분자로 백트래킹) |
| `:` | password에 `%3A`로 자동 인코딩 |
| `[` `]` | password에 `%5B` `%5D`로 자동 인코딩 |
| 공백 | `%20`으로 자동 인코딩 |

**그대로 통과하는 문자**: `-` `_` `.` `~` `&` `+` 등 unreserved와 일부 sub-delims.

이 자동 변형은 *우연히* DB 비밀번호와 일치할 수도 있지만, 드라이버가 percent-decoding을 어떻게 처리하느냐에 따라 결과가 달라집니다. **표준 RFC가 reserved로 정의한 문자는 명시적으로 인코딩**하는 것이 안전합니다.

### 깨지는 메커니즘 (`#` 케이스 단계별)

<!-- secretlint-disable -->
```js
new URL("postgresql://user:pa#ss@host:5432/db")
//                            ↑ 여기서부터를 fragment로 인식
// 파서가 인식한 구조:
//   password = "pa"
//   host     = ""              ← 비어 있음
//   fragment = "ss@host:5432/db"
// → host missing → ERR_INVALID_URL
```
<!-- secretlint-enable -->

## 코드/문법

### 빠른 인코딩

```bash
# Node.js 한 줄
node -e "console.log(encodeURIComponent('실제비밀번호'))"

# zsh/bash 헬퍼 함수 등록
urlencode() { node -e "console.log(encodeURIComponent(process.argv[1]))" "$1"; }
urlencode 'p@ss#word'
# → p%40ss%23word
```

`encodeURIComponent`는 `A-Za-z0-9 - _ . ! ~ * ' ( )`만 제외하고 모두 인코딩하므로 password용 인코딩에 안전한 기본값입니다.

### URL에 든 비밀번호를 *꺼낼* 때는 디코딩

반대 방향도 있습니다. [`infra/aws/db-apply.sh`](../../infra/aws/db-apply.sh)는 SSM의 `DATABASE_URL`에서 비밀번호를 뽑아 `ALTER ROLE app WITH LOGIN PASSWORD '…'`에 넣는데, URL 안의 값은 *인코딩된 형태*이므로 반드시 풀어서 씁니다:

```bash
APP_PW=$(python3 -c "import sys,urllib.parse as u; print(u.unquote(u.urlsplit(sys.argv[1]).password))" "$APP_URL")
```

`unquote`를 빼먹으면 `%23`이 문자 그대로 비밀번호가 되어 URL의 비밀번호와 DB의 비밀번호가 어긋납니다 — 앱은 `password authentication failed`.

## 흔히 영향받는 문자 표

| 문자 | URL에서 의미 | password에 그대로? | 인코딩 |
|---|---|---|---|
| `#` | fragment 시작 — **가장 흔한 함정** | ❌ 즉시 `ERR_INVALID_URL` | `%23` |
| `/` | path 시작 | ❌ 즉시 `ERR_INVALID_URL` | `%2F` |
| `?` | query 시작 (`?sslmode=…`가 이미 있음) | ❌ | `%3F` |
| `:` | user/password 구분자 | ⚠️ 파서가 암묵 인코딩, 의존 비권장 | `%3A` |
| `@` | userinfo 종료 | ⚠️ 동일 | `%40` |
| `[` `]` | IPv6 host 표시 | ⚠️ 동일 | `%5B` `%5D` |
| ` ` (공백) | path/query에서 % 인코딩 필수 | ⚠️ 동일 | `%20` |
| `%` | percent-encoding 시작 표시 | ⚠️ 두 자리 hex 뒤따르면 디코딩됨 | `%25` |
| `&` | query 파라미터 구분 (`&sslrootcert=…`가 이미 있음) | ⚠️ 드라이버에 따라 | `%26` |
| `+` | query에서 공백 의미 | ⚠️ 드라이버에 따라 | `%2B` |
| `-` `.` `_` `~` | unreserved | ✅ 그대로 OK | 불필요 |

## 이 프로젝트의 결정

### 1. 비밀번호 정책 — 영문·숫자만 생성한다

가장 안전한 자리는 *불안전 문자를 비밀번호에 넣지 않는 것*. CLI, 환경 변수, `.env` 파일, SSM, CI 어디로 흘러도 함정 없이 통과합니다.

[`infra/aws/setup.sh`](../../infra/aws/setup.sh)의 `rand()`가 RDS 마스터·`app` 비밀번호를 만들 때 이 정책을 강제합니다:

```bash
rand() { openssl rand -base64 36 | tr -d '/+=' | cut -c1-32; }   # base64에서 / + = 를 제거 → 영숫자 32자
```

비밀번호 강도는 *길이*가 *문자 종류*보다 더 큰 변수라, 특수문자 없이 32자면 충분합니다. 로컬은 고정 `app`/`app`(`scripts/db-reset.sh`).

### 2. 어쩔 수 없이 특수문자가 있는 경우

`DATABASE_URL`에 넣기 *전에* `encodeURIComponent`로 인코딩한 password를 사용. 인코딩 작업은 *URL에 박는 순간 단 한 번*만 — SSM에 들어가는 값은 이미 인코딩된 상태여야 합니다. 그리고 그 URL에서 비밀번호를 다시 꺼내는 쪽(`db-apply.sh`)은 반드시 디코딩합니다.

### 3. 등록 후 검증 (deploy 직전 체크리스트)

```bash
# SSM 값을 그대로 파서에 통과시켜 본다
DATABASE_URL=$(aws ssm get-parameter --with-decryption --name /iroiro/<env>/DATABASE_URL --query Parameter.Value --output text) \
node -e "const u = new URL(process.env.DATABASE_URL); console.log({host: u.hostname, port: u.port, user: u.username, db: u.pathname, ssl: u.searchParams.get('sslmode')})"
# 호스트·포트·user=app·db=/iroiro·ssl=verify-full 가 출력되면 파싱 통과
# 실패 시 ERR_INVALID_URL — production 깨지기 전에 잡힘
```

`db-apply.sh`는 마지막 단계에서 `app` 롤로 실제 접속해 테이블 수를 세므로, 이 스크립트가 끝까지 돌았다면 URL·비밀번호·SSL 설정이 모두 맞은 것입니다.

### 4. SSL 파라미터는 query에, 컨테이너 경로로

`sslmode=verify-full&sslrootcert=/app/rds-ca.pem` — `verify-full`은 서버 인증서 체인·호스트명까지 검증하고, `sslrootcert`는 Dockerfile이 이미지에 넣은 RDS CA 번들 경로입니다(컨테이너 안 경로라 로컬 `psql`로 그대로 쓰면 파일이 없어 실패 — `db-apply.sh`는 그래서 접속 테스트 때 `?sslmode=require`로 바꿔 붙습니다). `pg`는 `require`도 체인을 검증하므로 CA 없이 `require`만 쓰면 self-signed 오류가 납니다.

## 참고

- [RFC 3986 — Uniform Resource Identifier (URI): Generic Syntax](https://datatracker.ietf.org/doc/html/rfc3986)
- [WHATWG URL Standard](https://url.spec.whatwg.org/)
- [Node.js — The WHATWG URL API](https://nodejs.org/api/url.html#the-whatwg-url-api)
- [MDN — `encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
- [PostgreSQL — Connection URIs (`libpq`)](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING-URIS) — `sslmode`·`sslrootcert` 파라미터
- [AWS RDS — SSL/TLS로 PostgreSQL 연결](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html)
- [`docs/deployment.md`](../deployment.md) — SSM·RDS·`db-apply.sh` 운영 절차
- 실제 사고: `app/(admin)` 진입 시 `prisma.team.findMany()` 호출에서 `ERR_INVALID_URL` (첫 배포, 2026-05-23). 비밀번호의 `#` 미인코딩이 원인.
