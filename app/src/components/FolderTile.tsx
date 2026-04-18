import Link from "next/link";
import styles from "./FolderTile.module.css";

export function FolderTile({
  id, name, fileCount, subfolderCount,
}: { id: string; name: string; fileCount: number; subfolderCount: number }) {
  const parts: string[] = [];
  if (fileCount) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
  if (subfolderCount) parts.push(`${subfolderCount} subfolder${subfolderCount === 1 ? "" : "s"}`);
  return (
    <Link href={`/d/${id}`} className={styles.tile}>
      <span className={styles.name}>{name}</span>
      {parts.length > 0 && <small className={styles.counts}>{parts.join(" · ")}</small>}
    </Link>
  );
}
