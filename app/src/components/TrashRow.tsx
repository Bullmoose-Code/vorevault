"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TrashItem } from "@/lib/folders";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialogs";
import styles from "./TrashRow.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function daysRemaining(deletedAt: Date): number {
  const ms = deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

type Props = {
  item: TrashItem;
  currentUserIsAdmin: boolean;
  currentUserId: string;
};

export function TrashRow({ item, currentUserIsAdmin, currentUserId: _currentUserId }: Props) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // The trash list doesn't carry owner id; show delete-forever only when admin.
  // Owners can still delete-forever via the file/folder detail page after trashing.
  // Server-side checks in the DELETE routes are the source of truth.
  const canDeleteForever = currentUserIsAdmin;

  async function onRestore() {
    const url = item.kind === "folder"
      ? `/api/folders/${item.id}/restore`
      : `/api/files/${item.id}/restore`;
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) return;
    router.refresh();
  }

  async function doPermanentDelete() {
    const url = item.kind === "folder"
      ? `/api/folders/${item.id}`
      : `/api/files/${item.id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? res.statusText);
    }
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <div className={styles.row}>
      <div className={styles.kind}>{item.kind}</div>
      <div className={styles.name}>{item.name}</div>
      <div className={styles.meta}>
        <span>trashed by <strong>@{item.actor_username}</strong></span>
        {item.kind === "file" && <span> · {formatBytes(item.size_bytes)}</span>}
        <span> · {daysRemaining(new Date(item.deleted_at))} days left</span>
      </div>
      <div className={styles.actions}>
        <Button type="button" onClick={onRestore}>restore</Button>
        {canDeleteForever && (
          <Button variant="danger" type="button" onClick={() => setDeleteOpen(true)}>
            delete forever
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`delete ${item.kind} forever`}
        message={`Permanently delete "${item.name}"? This cannot be undone.`}
        confirmLabel="delete forever"
        variant="danger"
        onConfirm={doPermanentDelete}
      />
    </div>
  );
}
