"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { FolderPickerModal } from "./FolderPickerModal";
import styles from "./FolderPicker.module.css";

type Props = {
  value: string | null;
  onChange: (folderId: string | null) => void;
};

export function FolderPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setSelectedName(null); return; }
    let cancelled = false;
    fetch("/api/folders/tree")
      .then((r) => r.json())
      .then((d: { folders?: Array<{ id: string; name: string }> }) => {
        if (cancelled) return;
        const node = (d.folders ?? []).find((n) => n.id === value);
        setSelectedName(node?.name ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value]);

  const label = value
    ? `Folder: ${selectedName ?? "…"}`
    : "Folder: None (root)";

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
      >
        <span className={styles.triggerIcon} aria-hidden="true">📁</span>
        <span className={styles.triggerLabel}>{label}</span>
        <span className={styles.triggerCaret} aria-hidden="true">›</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose folder"
        size="md"
      >
        <FolderPickerModal
          initialFolderId={value}
          onCancel={() => setOpen(false)}
          onSelect={(folderId) => {
            onChange(folderId);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
