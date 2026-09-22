import type { ReactNode } from "react";

// 약관·정책 공용 레이아웃 — 제목·시행일·본문을 같은 리듬으로 정렬한다.
export const LEGAL_CONTACT = "coby5502@iroiro.club";
export const LEGAL_SERVICE_NAME = "이로이로";

export function LegalDoc({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-2xl py-8">
      <h1 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">시행일: {effectiveDate}</p>
      <div className="legal-body mt-6 space-y-6 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </article>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-foreground">{heading}</h2>
      <div className="space-y-2 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </section>
  );
}
