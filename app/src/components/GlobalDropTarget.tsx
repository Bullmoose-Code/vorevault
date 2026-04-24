"use client";

import { useEffect, useRef, useState } from "react";
import { useUploadProgress } from "./UploadProgressProvider";
import { FolderPickerModal } from "./FolderPickerModal";
import { Modal } from "./Modal";
import { VV_DRAG_MIME } from "@/lib/dragDrop";
import { collectDroppedItems } from "@/lib/dropEntries";
import { uploadItemsWithTree, type UploadItem } from "@/lib/uploadTree";
import styles from "./GlobalDropTarget.module.css";

export function GlobalDropTarget({ currentFolderId }: { currentFolderId: string | null }) {
  const { enqueue } = useUploadProgress();
  const [scrim, setScrim] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingItemsRef = useRef<UploadItem[]>([]);
  const depthRef = useRef(0);

  useEffect(() => {
    // Only react to OS-level file drops. Internal drags (FileCard/FolderTile
    // reorganization) carry VV_DRAG_MIME and must pass through untouched so
    // the card-level dropzones can handle them.
    function isExternalFileDrag(dt: DataTransfer | null) {
      if (!dt) return false;
      const types = Array.from(dt.types || []);
      if (!types.includes("Files")) return false;
      if (types.includes(VV_DRAG_MIME)) return false;
      return true;
    }

    function onDragEnter(e: DragEvent) {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      depthRef.current += 1;
      setScrim(true);
    }
    function onDragOver(e: DragEvent) {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      e.preventDefault();
    }
    function onDragLeave() {
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setScrim(false);
    }
    async function onDrop(e: DragEvent) {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      depthRef.current = 0;
      setScrim(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      const items = await collectDroppedItems(dt);
      if (items.length === 0) return;
      pendingItemsRef.current = items;
      setError(null);
      setPickerOpen(true);
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      {scrim && (
        <div data-testid="global-drop-scrim" className={styles.scrim} aria-hidden="true">
          <div className={styles.message}>drop files to upload</div>
        </div>
      )}
      <Modal
        open={pickerOpen}
        onClose={() => { pendingItemsRef.current = []; setPickerOpen(false); }}
        title="choose folder"
        size="md"
      >
        <FolderPickerModal
          initialFolderId={currentFolderId}
          onCancel={() => { pendingItemsRef.current = []; setPickerOpen(false); }}
          onSelect={async (folderId) => {
            setPickerOpen(false);
            const items = pendingItemsRef.current;
            pendingItemsRef.current = [];
            await uploadItemsWithTree({
              items,
              destFolderId: folderId,
              enqueue,
              setError,
            });
          }}
        />
      </Modal>
      {error && <div role="alert" className={styles.error}>{error}</div>}
    </>
  );
}
