import type { NameI18n } from "@/lib/i18n";

export type Team = {
  id: number;
  name: string;
  nameI18n: NameI18n | null;
  debutDate: string | null;
  disbandDate: string | null;
  /** 노출 순서(1부터, 관리자 지정). null 은 맨 뒤. 운영 규칙: CUTIE STREET 1, 나머지 데뷔순. */
  displayOrder: number | null;
  /** 그룹 고유색(#rrggbb). 카탈로그 칩·헤더 색. null 이면 기본 색. */
  themeColor: string | null;
  createdAt: string;
  updatedAt: string;
};
