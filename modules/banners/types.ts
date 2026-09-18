// 배너 DTO — id는 number(작은 값), 날짜는 ISO 문자열 또는 null.
export type Banner = {
  id: number;
  title: string;
  imageKey: string;
  linkUrl: string;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
};
