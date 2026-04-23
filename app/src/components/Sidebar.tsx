import Link from "next/link";
import { NewMenu } from "./NewMenu";
import { VaultTree } from "./VaultTree";
import { StorageBar } from "./StorageBar";
import styles from "./Sidebar.module.css";

export function Sidebar({
  isAdmin,
  currentFolderId,
}: {
  isAdmin: boolean;
  currentFolderId: string | null;
}) {
  return (
    <aside className={styles.sidebar} aria-label="primary navigation">
      <div className={styles.newWrap}>
        <NewMenu currentFolderId={currentFolderId} />
      </div>

      <nav className={styles.nav}>
        <Link href="/" className={styles.navItem}>home</Link>
        <Link href="/recent" className={styles.navItem}>recent</Link>
        <Link href="/starred" className={styles.navItem}>starred</Link>
        <Link href="/mine" className={styles.navItem}>my uploads</Link>
      </nav>

      <div className={styles.sectionLabel}>vault</div>
      <div className={styles.tree}>
        <VaultTree />
      </div>

      {isAdmin && (
        <nav className={styles.nav}>
          <Link href="/admin" className={styles.navItem}>admin</Link>
        </nav>
      )}

      <div className={styles.spacer} />
      <StorageBar />
    </aside>
  );
}
