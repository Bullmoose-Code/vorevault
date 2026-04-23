"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog, PromptDialog } from "@/components/Dialogs";
import type { FolderRow } from "@/lib/folders";
import styles from "./FolderAdminActions.module.css";

export function FolderAdminActions({ folder }: { folder: FolderRow }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.action} onClick={() => setRenameOpen(true)}>
        rename
      </button>{" "}
      <button type="button" className={`${styles.action} ${styles.danger}`} onClick={() => setDeleteOpen(true)}>
        delete
      </button>

      <PromptDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="rename folder"
        label="folder name"
        initialValue={folder.name}
        confirmLabel="save"
        onConfirm={async (next) => {
          const res = await fetch(`/api/folders/${folder.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: next }),
            headers: { "Content-Type": "application/json" },
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? `${res.status}`);
          }
          setRenameOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="move folder to trash"
        message={`Move "${folder.name}" and its contents to trash? Can be restored within 30 days.`}
        confirmLabel="trash"
        variant="danger"
        onConfirm={async () => {
          const res = await fetch(`/api/folders/${folder.id}/trash`, { method: "POST" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? `${res.status}`);
          }
          setDeleteOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
