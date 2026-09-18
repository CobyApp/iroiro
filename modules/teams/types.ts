import type { NameI18n } from "@/lib/i18n";

export type Team = {
  id: number;
  name: string;
  nameI18n: NameI18n | null;
  debutDate: string | null;
  disbandDate: string | null;
  createdAt: string;
  updatedAt: string;
};
