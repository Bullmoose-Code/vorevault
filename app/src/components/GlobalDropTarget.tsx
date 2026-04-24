"use client";

import { useEffect, useRef, useState } from "react";
import { useUploadProgress } from "./UploadProgressProvider";
import { FolderPickerModal } from "./FolderPickerModal";
import { VV_DRAG_MIME } from "@/lib/dragDrop";
import styles from "./GlobalDropTarget.module.css";

// MVP: files only. Directory drops fall through to ignored / filesystem-dependent
// behavior. If users ask for recursive drop later, hook into NewMenu's
// webkitGetAsEntry tree path.
export function GlobalDropTarget() {
  const { enqueue } = useUploadProgress();
  const [scrim, setScrim] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pendingFilesRef = useRef<File[]>([]);
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
      e.preventDefault(); // required to allow drop
    }
    function onDragLeave() {
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setScrim(false);
    }
    function onDrop(e: DragEvent) {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      depthRef.current = 0;
      setScrim(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      pendingFilesRef.current = files;
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
      {pickerOpen && (
        <FolderPickerModal
          initialFolderId={null}
          onCancel={() => { pendingFilesRef.current = []; setPickerOpen(false); }}
          onSelect={(folderId) => {
            setPickerOpen(false);
            for (const file of pendingFilesRef.current) enqueue(file, folderId);
            pendingFilesRef.current = [];
          }}
        />
      )}
    </>
  );
}
