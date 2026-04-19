import Link from "next/link";
import styles from "./FolderTile.module.css";

export function FolderTile({
  id, name, fileCount, subfolderCount,
}: { id: string; name: string; fileCount: number; subfolderCount: number }) {
  const hasFiles = fileCount > 0;
  const hasSubs = subfolderCount > 0;
  return (
    <Link href={`/d/${id}`} className={styles.tile}>
      <span className={styles.name}>{name}</span>
      {(hasFiles || hasSubs) && (
        <small className={`vv-meta ${styles.counts}`}>
          {hasFiles && (
            <>
              <strong>{fileCount}</strong> {fileCount === 1 ? "file" : "files"}
            </>
          )}
          {hasFiles && hasSubs && " · "}
          {hasSubs && (
            <>
              <strong>{subfolderCount}</strong> {subfolderCount === 1 ? "subfolder" : "subfolders"}
            </>
          )}
        </small>
      )}
    </Link>
  );
}
