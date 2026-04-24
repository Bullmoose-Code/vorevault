"use client";

import { useState, type MouseEvent, type DragEvent } from "react";
import type { FileWithUploader } from "@/lib/files";
import { classifyFile } from "@/lib/fileKind";
import { FileIcon } from "./FileIcon";
import { FileContextMenu } from "./FileContextMenu";
import { useCurrentUser } from "./CurrentUserContext";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { readNavItems, sliceBetween } from "@/lib/gridNav";
import { encodeDragPayload, resolveDraggedItems } from "@/lib/dragDrop";
import styles from "./FileCard.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const ago = Date.now() - d.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FileCard({
  file,
  isShared,
}: {
  file: FileWithUploader;
  isShared?: boolean;
}) {
  const user = useCurrentUser();
  const selection = useSelection();
  const selected = selection.isSelected("file", file.id);
  const canManage = user.isAdmin || file.uploader_id === user.id;

  const { kind, label } = classifyFile(file.mime_type, file.original_name);
  const duration = (kind === "video" || kind === "audio") ? formatDuration(file.duration_sec) : null;
  const hasThumb = file.thumbnail_path != null;

  const descriptor: SelectedItem = {
    kind: "file",
    id: file.id,
    name: file.original_name,
    canManage,
    folderId: file.folder_id,
  };

  const [isDragging, setIsDragging] = useState(false);

  function handleDragStart(e: DragEvent<HTMLAnchorElement>) {
    const items = resolveDraggedItems(descriptor, selection.items);
    encodeDragPayload(e.dataTransfer, items);
    setIsDragging(true);
  }

  function handleDragEnd() {
    setIsDragging(false);
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

  const classes = [styles.card];
  if (selected) classes.push(styles.selected);
  if (isDragging) classes.push(styles.dragging);
  const className = classes.join(" ");

  return (
    <FileContextMenu file={file}>
      <a href={`/f/${file.id}`} className={className} onClick={handleClick} draggable={canManage} onDragStart={handleDragStart} onDragEnd={handleDragEnd} aria-pressed={selected} data-nav-item data-nav-descriptor={JSON.stringify(descriptor)} tabIndex={0}>
        <div className={styles.thumb}>
          {hasThumb ? (
            <img src={`/api/thumbs/${file.id}`} alt="" loading="lazy" />
          ) : (
            <div className={`${styles.iconTile} ${styles[`kind_${kind.replaceAll("-", "_")}`]}`}>
              <FileIcon kind={kind} size={48} />
            </div>
          )}
          <span className={styles.typeBadge}>{label}</span>
          {duration && <span className={styles.duration}>{duration}</span>}
          {isShared && <span className={styles.sharedBadge}>✦ shared</span>}
        </div>
        <div className={styles.meta}>
          <div className={styles.title}>{file.original_name}</div>
          <div className={`vv-meta ${styles.sub}`}>
            {file.uploader_name} · <strong>{formatBytes(file.size_bytes)}</strong> · <strong>{relativeTime(file.created_at)}</strong>
          </div>
        </div>
      </a>
    </FileContextMenu>
  );
}
