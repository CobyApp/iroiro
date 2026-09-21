import type { NameI18n } from "@/lib/i18n";

export type Team = {
  id: number;
  name: string;
  nameI18n: NameI18n | null;
  debutDate: string | null;
  disbandDate: string | null;
  /** 노출 순서(1부터, 관리자 지정). null 은 맨 뒤. 운영 규칙: CUTIE STREET 1, 나머지 데뷔순. */
  displayOrder: number | null;
  createdAt: string;
  updatedAt: string;
};
