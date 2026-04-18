"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import styles from "./NewFolderDialog.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  parentId: string | null;
  parentName: string | null;
  onCreated: (folder: { id: string; name: string }) => void;
};

export function NewFolderDialog({
  open, onClose, parentId, parentName, onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = parentName
    ? `New folder in ${parentName}`
    : "New folder in root";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, parentId }),
      });
      if (res.status === 201 || res.ok) {
        const folder = await res.json();
        setName("");
        onCreated(folder);
        onClose();
      } else if (res.status === 409) {
        setError(`A folder named "${trimmed}" already exists here.`);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(`Create failed: ${(body as { error?: string }).error ?? res.statusText}`);
      }
    } catch (err) {
      setError(`Create failed: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Folder name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className={styles.input}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0}
            className={styles.create}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
