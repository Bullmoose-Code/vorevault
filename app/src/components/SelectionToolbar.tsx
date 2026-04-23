"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { useItemActions } from "./ItemActionProvider";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialogs";
import styles from "./SelectionToolbar.module.css";

type BatchResult = { succeeded: number; failed: number };

async function batchTrash(items: SelectedItem[]): Promise<BatchResult> {
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    const url =
      it.kind === "file"
        ? `/api/files/${it.id}/trash`
        : `/api/folders/${it.id}/trash`;
    try {
      const res = await fetch(url, { method: "POST" });
      if (res.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { succeeded, failed };
}

export function SelectionToolbar() {
  const selection = useSelection();
  const { showToast } = useItemActions();
  const router = useRouter();
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashing, setTrashing] = useState(false);

  if (selection.size === 0) return null;

  const allManageable = selection.items.every((it) => it.canManage);

  async function runTrash() {
    setTrashing(true);
    try {
      const result = await batchTrash(selection.items);
      setTrashOpen(false);
      selection.clear();
      router.refresh();
      if (result.failed === 0) {
        showToast({ message: `trashed ${result.succeeded}`, variant: "success" });
      } else {
        showToast({
          message: `trashed ${result.succeeded}, failed ${result.failed}`,
          variant: "error",
        });
      }
    } finally {
      setTrashing(false);
    }
  }

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="selection actions">
        <span className={styles.count}>
          <strong>{selection.size}</strong> selected
        </span>
        <div className={styles.spacer} />
        {allManageable && (
          <Button
            type="button"
            variant="danger"
            onClick={() => setTrashOpen(true)}
            disabled={trashing}
          >
            move to trash
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => selection.clear()}>
          clear
        </Button>
      </div>

      <ConfirmDialog
        open={trashOpen}
        onClose={() => {
          if (!trashing) setTrashOpen(false);
        }}
        title="move to trash"
        message={`move ${selection.size} item${selection.size === 1 ? "" : "s"} to trash? can be restored within 30 days.`}
        confirmLabel="trash"
        variant="danger"
        onConfirm={runTrash}
      />
    </>
  );
}
