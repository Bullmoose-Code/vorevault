"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { useItemActions } from "./ItemActionProvider";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialogs";
import { Modal } from "./Modal";
import { FolderPicker } from "./FolderPicker";
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

async function batchMove(
  items: SelectedItem[],
  folderId: string | null,
): Promise<BatchResult> {
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    try {
      const res =
        it.kind === "file"
          ? await fetch(`/api/files/${it.id}/move`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ folderId }),
            })
          : await fetch(`/api/folders/${it.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ parentId: folderId }),
            });
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
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

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

  async function runMove() {
    setMoving(true);
    try {
      const result = await batchMove(selection.items, moveTarget);
      setMoveOpen(false);
      setMoveTarget(null);
      selection.clear();
      router.refresh();
      if (result.failed === 0) {
        showToast({ message: `moved ${result.succeeded}`, variant: "success" });
      } else {
        showToast({
          message: `moved ${result.succeeded}, failed ${result.failed}`,
          variant: "error",
        });
      }
    } finally {
      setMoving(false);
    }
  }

  const itemLabel = `item${selection.size === 1 ? "" : "s"}`;

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="selection actions">
        <span className={styles.count}>
          <strong>{selection.size}</strong> selected
        </span>
        <div className={styles.spacer} />
        {allManageable && (
          <>
            <Button
              type="button"
              onClick={() => setMoveOpen(true)}
              disabled={moving}
            >
              move to…
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => setTrashOpen(true)}
              disabled={trashing}
            >
              move to trash
            </Button>
          </>
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
        message={`move ${selection.size} ${itemLabel} to trash? can be restored within 30 days.`}
        confirmLabel="trash"
        variant="danger"
        onConfirm={runTrash}
      />

      <Modal
        open={moveOpen}
        onClose={() => {
          if (!moving) setMoveOpen(false);
        }}
        title={`move ${selection.size} ${itemLabel}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FolderPicker value={moveTarget} onChange={setMoveTarget} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMoveOpen(false)}
            >
              cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={runMove}
              disabled={moving}
            >
              {moving ? "moving…" : "save"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
