"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { useItemActions } from "./ItemActionProvider";
import { moveItems, type BatchMoveResult } from "@/lib/moveItems";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialogs";
import { Modal } from "./Modal";
import { FolderPicker } from "./FolderPicker";
import styles from "./SelectionToolbar.module.css";

async function batchTrash(items: SelectedItem[]): Promise<BatchMoveResult> {
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


const MAX_ZIP = 50;

function startZipDownload(items: SelectedItem[]) {
  const ids = items.filter((it) => it.kind === "file").map((it) => it.id);
  if (ids.length === 0) return;
  const url = `/api/files/zip?ids=${encodeURIComponent(ids.join(","))}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
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

  useEffect(() => {
    function onMove() { setMoveOpen(true); }
    function onTrash() { setTrashOpen(true); }
    window.addEventListener("vv:batch-move", onMove);
    window.addEventListener("vv:batch-trash", onTrash);
    return () => {
      window.removeEventListener("vv:batch-move", onMove);
      window.removeEventListener("vv:batch-trash", onTrash);
    };
  }, []);

  if (selection.size === 0) return null;

  const allManageable = selection.items.every((it) => it.canManage);
  const onlyFiles = selection.items.every((it) => it.kind === "file");
  const zipDisabled = !onlyFiles || selection.size > MAX_ZIP;

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
      const result = await moveItems(selection.items, moveTarget);
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
        {onlyFiles && (
          <Button
            type="button"
            variant="primary"
            onClick={() => startZipDownload(selection.items)}
            disabled={zipDisabled}
            title={selection.size > MAX_ZIP ? `max ${MAX_ZIP} files` : undefined}
          >
            download as zip
          </Button>
        )}
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
