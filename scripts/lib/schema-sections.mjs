// db/*.sql 을 `-- [<name>]` 마커 기준 섹션으로 나눈다 — 마이그레이션 러너(scripts/db-migrate.mjs)의 순수 부분.
// 규약(docs/architecture/data-modeling.md): 새 변경은 파일 끝에 `-- [YYYYMMDDHHMMSS_name]` 섹션으로 덧붙이고,
// 러너는 DB 의 schema_migration 표와 비교해 아직 없는 섹션만 파일 순서대로 적용한다.

const MARKER = /^-- \[([A-Za-z0-9_]+)\]\s*$/;

/**
 * @param {string} sql 파일 전체
 * @returns {{ name: string, sql: string }[]} 첫 마커 이전의 서두(주석·헤더)는 첫 섹션 SQL 앞에 붙인다.
 */
export function splitSections(sql) {
  const lines = sql.split(/\r?\n/);
  const sections = [];
  let preamble = [];
  let current = null;
  for (const line of lines) {
    const m = MARKER.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { name: m[1], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) sections.push(current);
  const names = new Set();
  for (const s of sections) {
    if (names.has(s.name)) throw new Error(`중복 섹션 이름: ${s.name}`);
    names.add(s.name);
  }
  return sections.map((s, i) => ({
    name: s.name,
    sql: (i === 0 ? preamble.concat(s.lines) : s.lines).join("\n").trim(),
  }));
}

// 아직 적용되지 않은 섹션 — 파일 순서를 유지한다.
export function pendingSections(sections, appliedNames) {
  const applied = new Set(appliedNames);
  return sections.filter((s) => !applied.has(s.name));
}

// 베이스라인 — 이미 손으로 적용된 DB 에 "여기까지는 됐다"를 기록할 때, 기록할 이름 목록을 계산한다.
// except 에 든 섹션은 미적용으로 남긴다(다음 러너 실행에서 적용됨).
export function baselineNames(sections, except = []) {
  const skip = new Set(except);
  for (const name of skip) {
    if (!sections.some((s) => s.name === name)) throw new Error(`알 수 없는 섹션: ${name}`);
  }
  return sections.map((s) => s.name).filter((n) => !skip.has(n));
}
