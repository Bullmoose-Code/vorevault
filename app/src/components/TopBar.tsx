import { MooseLogo } from "./MooseLogo";
import { Pill } from "./Pill";
import { UserChip } from "./UserChip";
import styles from "./TopBar.module.css";

export function TopBar({
  username,
  avatarUrl,
  showUpload = true,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  showUpload?: boolean;
  isAdmin?: boolean;
}) {
  return (
    <header className={styles.topbar}>
      <a className={styles.brand} href="/">
        <MooseLogo size="header" />
        vorevault
      </a>
      <div className={styles.actions}>
        {showUpload && <Pill variant="primary" href="/upload">↑ Upload</Pill>}
        {isAdmin && <Pill variant="ghost" href="/admin">Admin</Pill>}
        <UserChip username={username} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
