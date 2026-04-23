import Link from "next/link";
import { FolderContextMenu } from "./FolderContextMenu";
import styles from "./FolderTile.module.css";

type Props = {
  id: string;
  name: string;
  fileCount: number;
  subfolderCount: number;
  createdBy: string;
  parentId: string | null;
};

export function FolderTile({ id, name, fileCount, subfolderCount, createdBy, parentId }: Props) {
  const hasFiles = fileCount > 0;
  const hasSubs = subfolderCount > 0;
  return (
    <FolderContextMenu folder={{ id, name, createdBy, parentId }}>
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
    </FolderContextMenu>
  );
}
