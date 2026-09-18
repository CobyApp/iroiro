import { getPublicUrl } from "@/lib/r2/presign";

// 원형 프로필 아바타 — avatarKey 있으면 이미지, 없으면 닉네임 이니셜. 서버 컴포넌트.
export function ProfileAvatar({
  avatarKey,
  displayName,
  size = 72,
}: {
  avatarKey: string | null;
  displayName: string;
  size?: number;
}) {
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-lemon font-display text-xl text-ink shadow-card"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {avatarKey ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 외부 호스트, next/image 미설정
        <img
          src={getPublicUrl(avatarKey)}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
}
