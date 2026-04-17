import styles from "./UserChip.module.css";

export function UserChip({
  username,
  avatarUrl,
  href,
}: {
  username: string;
  avatarUrl?: string | null;
  href?: string;
}) {
  return (
    <a className={styles.chip} href={href ?? "#"}>
      <span className={styles.avatar}>
        {avatarUrl ? <img src={avatarUrl} alt="" /> : null}
      </span>
      <span>{username}</span>
      <span className={styles.caret}>▾</span>
    </a>
  );
}
