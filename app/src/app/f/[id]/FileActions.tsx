"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { FolderPicker } from "@/components/FolderPicker";
import { ShareBanner } from "@/components/ShareBanner";
import styles from "./FileActions.module.css";

type Props = {
  fileId: string;
  fileName: string;
  initialFolderId: string | null;
  isOwnerOrAdmin: boolean;
  initialShareUrl: string | null;
};

export function FileActions({
  fileId, fileName, initialFolderId, isOwnerOrAdmin, initialShareUrl,
}: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState(initialShareUrl);
  const [sharing, setSharing] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(initialFolderId);
  const [moving, setMoving] = useState(false);

  async function handleRename() {
    const next = window.prompt("Rename file:", fileName);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === fileName) return;
    setRenaming(true);
    setError(null);
    const res = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(`Rename failed: ${(data as { error?: string }).error ?? res.statusText}`);
    }
    setRenaming(false);
  }

  async function handleMoveSave() {
    setMoving(true);
    setError(null);
    const res = await fetch(`/api/files/${fileId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: moveTarget }),
    });
    if (res.ok) {
      setMoveOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(`Move failed: ${(data as { error?: string }).error ?? res.statusText}`);
    }
    setMoving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this file? It can be recovered within 7 days.")) return;
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/files/${fileId}/delete`, { method: "POST" });
    if (res.ok) {
      router.push("/");
    } else {
      setError(`Delete failed: ${res.status}`);
      setDeleting(false);
    }
  }

  async function handleToggleShare() {
    setSharing(true);
    setError(null);
    const action = shareUrl ? "revoke" : "create";
    const res = await fetch(`/api/files/${fileId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      if (action === "create") {
        const data = await res.json();
        setShareUrl(data.url);
      } else {
        setShareUrl(null);
      }
    } else {
      setError(`Share action failed: ${res.status}`);
    }
    setSharing(false);
  }

  return (
    <>
      <div className={styles.actions}>
        <a
          href={`/api/stream/${fileId}`}
          download
          style={{ textDecoration: "none" }}
        >
          <Button variant="primary" type="button">↓ Download</Button>
        </a>
        <Button
          variant="success"
          type="button"
          onClick={handleToggleShare}
          disabled={sharing}
        >
          {sharing ? "..." : shareUrl ? "Revoke public link" : "✦ Create public link"}
        </Button>
        {isOwnerOrAdmin && (
          <>
            <Button
              type="button"
              onClick={handleRename}
              disabled={renaming}
            >
              {renaming ? "..." : "Rename"}
            </Button>
            <Button
              type="button"
              onClick={() => setMoveOpen((o) => !o)}
            >
              {moveOpen ? "Cancel move" : "Move"}
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </>
        )}
        {error && <span className={styles.error}>{error}</span>}
      </div>
      {moveOpen && isOwnerOrAdmin && (
        <div className={styles.movePanel}>
          <FolderPicker value={moveTarget} onChange={setMoveTarget} />
          <Button type="button" variant="primary" onClick={handleMoveSave} disabled={moving}>
            {moving ? "Moving…" : "Save"}
          </Button>
        </div>
      )}
      {shareUrl && <ShareBanner url={shareUrl} />}
    </>
  );
}
