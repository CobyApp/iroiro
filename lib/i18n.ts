import { z } from "zod";

export const LOCALE_KEYS = ["ja-jpan", "ja-hira", "en"] as const;

export type LocaleKey = (typeof LOCALE_KEYS)[number];

export type NameI18n = Partial<Record<LocaleKey, string>>;

export const nameI18nSchema = z
  .object({
    "ja-jpan": z.string().min(1).optional(),
    "ja-hira": z.string().min(1).optional(),
    en: z.string().min(1).optional(),
  })
  .strict()
  .nullable()
  .optional();

export const LOCALE_LABELS: Record<LocaleKey, string> = {
  "ja-jpan": "일본어 표기",
  "ja-hira": "히라가나 표기",
  en: "영문명",
};

export const LOCALE_PLACEHOLDERS: Record<LocaleKey, string> = {
  "ja-jpan": "예: ニュージーンズ",
  "ja-hira": "예: にゅーじーんず",
  en: "예: NewJeans",
};
