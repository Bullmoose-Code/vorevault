"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { FolderContextMenu } from "./FolderContextMenu";
import { useCurrentUser } from "./CurrentUserContext";
import { useSelection, type SelectedItem } from "./SelectionContext";
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
  const user = useCurrentUser();
  const selection = useSelection();
  const selected = selection.isSelected("folder", id);
  const canManage = user.isAdmin || createdBy === user.id;
  const hasFiles = fileCount > 0;
  const hasSubs = subfolderCount > 0;

  const descriptor: SelectedItem = { kind: "folder", id, name, canManage, parentId };

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      selection.toggle(descriptor);
    }
  }

  const className = selected ? `${styles.tile} ${styles.selected}` : styles.tile;

  return (
    <FolderContextMenu folder={{ id, name, createdBy, parentId }}>
      <Link href={`/d/${id}`} className={className} onClick={handleClick} aria-pressed={selected}>
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
