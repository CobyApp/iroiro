# 10. Database URL 비밀번호 인코딩

## 왜 알아야 하는가

Supabase Cloud의 connection string은 **비밀번호가 박힌 URL 한 줄**로 발급됩니다.

<!-- secretlint-disable -->
```
postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:6543/postgres
```
<!-- secretlint-enable -->

비밀번호에 특수문자가 들어가면, 겉보기엔 URL 같지만 Node.js의 WHATWG URL 파서(`new URL`)가 reserved character를 *다른 구조 분리자*로 해석하면서 깨집니다. Prisma 7의 `@prisma/adapter-pg`는 connection string을 받으면 내부에서 `new URL()`을 호출하므로, 첫 쿼리 호출 시점에 표면화됩니다.

이 프로젝트도 Vercel 첫 배포에서 비밀번호의 `#`을 그대로 환경 변수에 넣어 `PrismaClientKnownRequestError: Invalid URL`(`code: ERR_INVALID_URL`, `modelName: Team`, `digest: 3016197042`)을 만났습니다 — 2026-05-23.

## 핵심 개념

### URL의 reserved character (RFC 3986)

URL 표준은 *구조 분리자로 사용*되는 문자를 reserved로 정의합니다. password 영역에 이들이 들어가면 percent-encoding(`%XX`) 필수.

| 분류 | 문자 | 영역 의미 |
|---|---|---|
| **gen-delims** (가장 위험) | `:` `/` `?` `#` `[` `]` `@` | 각각 user/password 구분, path 시작, query 시작, fragment 시작, IPv6 host, userinfo 종료 |
| **sub-delims** | `!` `$` `&` `'` `(` `)` `*` `+` `,` `;` `=` | RFC 상 userinfo 허용이지만 일부 드라이버는 보수적 |
| **`%`** | `%` | percent-encoding 자체의 시작 표시. literal로 쓰려면 `%25` |
| **unreserved** (어디든 안전) | `A-Z` `a-z` `0-9` `-` `.` `_` `~` | percent-encoding 불필요 |

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
new URL("postgresql://user:pa#ss@host:6543/db")
//                            ↑ 여기서부터를 fragment로 인식
// 파서가 인식한 구조:
//   password = "pa"
//   host     = ""              ← 비어 있음
//   fragment = "ss@host:6543/db"
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

### Supabase Dashboard placeholder

<!-- secretlint-disable -->
```
postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-1-<region>.pooler.supabase.com:6543/postgres
                          ↑
                  이 자리는 placeholder. 실제 비밀번호로 치환하세요.
                  대괄호 [ ]는 URL reserved character라 그대로 두면 즉시 깨집니다.
```
<!-- secretlint-enable -->

## 흔히 영향받는 문자 표

| 문자 | URL에서 의미 | password에 그대로? | 인코딩 |
|---|---|---|---|
| `#` | fragment 시작 — **가장 흔한 함정** | ❌ 즉시 `ERR_INVALID_URL` | `%23` |
| `/` | path 시작 | ❌ 즉시 `ERR_INVALID_URL` | `%2F` |
| `?` | query 시작 | ❌ | `%3F` |
| `:` | user/password 구분자 | ⚠️ 파서가 암묵 인코딩, 의존 비권장 | `%3A` |
| `@` | userinfo 종료 | ⚠️ 동일 | `%40` |
| `[` `]` | IPv6 host 표시 | ⚠️ 동일 | `%5B` `%5D` |
| ` ` (공백) | path/query에서 % 인코딩 필수 | ⚠️ 동일 | `%20` |
| `%` | percent-encoding 시작 표시 | ⚠️ 두 자리 hex 뒤따르면 디코딩됨 | `%25` |
| `&` | query 파라미터 구분 | ⚠️ 드라이버에 따라 | `%26` |
| `+` | query에서 공백 의미 | ⚠️ 드라이버에 따라 | `%2B` |
| `-` `.` `_` `~` | unreserved | ✅ 그대로 OK | 불필요 |

## 이 프로젝트의 결정

### 1. 비밀번호 정책 — 영문·숫자·`-`·`_`만 권장

가장 안전한 자리는 *불안전 문자를 비밀번호에 넣지 않는 것*. CLI, 환경 변수, `.env` 파일, Vault, CI 어디로 흘러도 함정 없이 통과합니다.

Supabase Dashboard → Project Settings → Database → **Reset database password**에서 32자 이상 영숫자·`-`·`_`만 사용한 값으로 재발급. 비밀번호 강도는 *길이*가 *문자 종류*보다 더 큰 변수입니다.

### 2. 어쩔 수 없이 특수문자가 있는 경우

`DATABASE_URL` 환경 변수에 넣기 *전에* `encodeURIComponent`로 인코딩한 password를 사용. 인코딩 작업은 *URL에 박는 순간 단 한 번*만 — `.env`나 Vercel UI에 들어가는 값은 이미 인코딩된 상태여야 합니다.

### 3. 등록 후 검증 (deploy 직전 체크리스트)

```bash
node -e "const u = new URL(process.env.DATABASE_URL); console.log({host: u.hostname, port: u.port, user: u.username})"
# 호스트·포트·user가 출력되면 파싱 통과
# 실패 시 ERR_INVALID_URL — production 깨지기 전에 잡힘
```

이 한 줄을 배포 직전 점검에 넣어두면, production에서 `prisma.team.findMany()` 시점에야 표면화되는 사고를 차단할 수 있습니다.

## 참고

- [RFC 3986 — Uniform Resource Identifier (URI): Generic Syntax](https://datatracker.ietf.org/doc/html/rfc3986)
- [WHATWG URL Standard](https://url.spec.whatwg.org/)
- [Node.js — The WHATWG URL API](https://nodejs.org/api/url.html#the-whatwg-url-api)
- [MDN — `encodeURIComponent`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent)
- [Supabase — Connecting to your database](https://supabase.com/docs/guides/database/connecting-to-postgres)
- 실제 사고: `app/(admin)` 진입 시 `prisma.team.findMany()` 호출에서 `ERR_INVALID_URL` (Vercel 첫 배포, 2026-05-23). 비밀번호의 `#` 미인코딩이 원인.
