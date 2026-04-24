"use client";

import { useState, type MouseEvent, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderContextMenu } from "./FolderContextMenu";
import { useCurrentUser } from "./CurrentUserContext";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { readNavItems, sliceBetween } from "@/lib/gridNav";
import { encodeDragPayload, decodeDragPayload, resolveDraggedItems, dropTargetIsValid, VV_DRAG_MIME } from "@/lib/dragDrop";
import { moveItems } from "@/lib/moveItems";
import { useItemActions } from "./ItemActionProvider";
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
  const router = useRouter();
  const { showToast } = useItemActions();
  const selected = selection.isSelected("folder", id);
  const canManage = user.isAdmin || createdBy === user.id;
  const hasFiles = fileCount > 0;
  const hasSubs = subfolderCount > 0;

  const descriptor: SelectedItem = { kind: "folder", id, name, canManage, parentId };

  const [isDragging, setIsDragging] = useState(false);
  const [dropHover, setDropHover] = useState(false);

  function handleDragStart(e: DragEvent<HTMLAnchorElement>) {
    const items = resolveDraggedItems(descriptor, selection.items);
    encodeDragPayload(e.dataTransfer, items);
    setIsDragging(true);
  }
  function handleDragEnd() { setIsDragging(false); }

  function handleDragOver(e: DragEvent<HTMLAnchorElement>) {
    if (!Array.from(e.dataTransfer.types).includes(VV_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHover(true);
  }
  function handleDragLeave() { setDropHover(false); }

  async function handleDrop(e: DragEvent<HTMLAnchorElement>) {
    setDropHover(false);
    const items = decodeDragPayload(e.dataTransfer);
    if (!items) return;
    if (!dropTargetIsValid(id, items)) return;
    e.preventDefault();
    const result = await moveItems(items, id);
    if (result.failed === 0) {
      showToast({ message: `moved ${result.succeeded}`, variant: "success" });
    } else {
      showToast({ message: `moved ${result.succeeded}, failed ${result.failed}`, variant: "error" });
    }
    router.refresh();
  }

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      selection.toggle(descriptor);
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      if (!selection.anchorId) {
        selection.toggle(descriptor);
        return;
      }
      const items = readNavItems();
      const range = sliceBetween(selection.anchorId, { kind: descriptor.kind, id: descriptor.id }, items);
      if (range.length > 0) {
        selection.addRange(range.map((r) => r.descriptor));
      } else {
        selection.toggle(descriptor);
      }
      return;
    }
    // plain click → navigate (default anchor behavior)
  }

  const classes = [styles.tile];
  if (selected) classes.push(styles.selected);
  if (isDragging) classes.push(styles.dragging);
  if (dropHover) classes.push(styles.dropTarget);
  const className = classes.join(" ");

  return (
    <FolderContextMenu folder={{ id, name, createdBy, parentId }}>
      <Link
        href={`/d/${id}`}
        className={className}
        onClick={handleClick}
        draggable={canManage}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-pressed={selected}
        data-nav-item
        data-nav-descriptor={JSON.stringify(descriptor)}
        tabIndex={0}
      >
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
