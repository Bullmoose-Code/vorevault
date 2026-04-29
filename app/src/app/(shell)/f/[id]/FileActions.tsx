"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { ConfirmDialog, PromptDialog } from "@/components/Dialogs";
import { FolderPicker } from "@/components/FolderPicker";
import { ShareBanner } from "@/components/ShareBanner";
import { buildDesktopLink } from "@/lib/desktop-link";
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
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState(initialShareUrl);
  const [sharing, setSharing] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(initialFolderId);
  const [moving, setMoving] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copiedDesktopLink, setCopiedDesktopLink] = useState(false);

  async function handleCopyDesktopLink() {
    const url = buildDesktopLink(fileId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedDesktopLink(true);
      setTimeout(() => setCopiedDesktopLink(false), 2000);
    } catch {
      setError(`Couldn't copy — copy manually: ${url}`);
    }
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
          {sharing ? "…" : shareUrl ? "Revoke public link" : "✦ Create public link"}
        </Button>
        <Button
          type="button"
          onClick={handleCopyDesktopLink}
          aria-label="Copy desktop link"
          title="Copy a vorevault:// link that opens this file in the user's browser via the desktop app"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ verticalAlign: "-2px", marginRight: "6px" }}
          >
            <rect x="1.5" y="2" width="11" height="7.5" rx="1" />
            <line x1="5" y1="12" x2="9" y2="12" />
            <line x1="7" y1="9.5" x2="7" y2="12" />
          </svg>
          {copiedDesktopLink ? "Copied" : "Copy desktop link"}
        </Button>
        {isOwnerOrAdmin && (
          <>
            <Button
              type="button"
              onClick={() => setRenameOpen(true)}
            >
              rename
            </Button>
            <Button
              type="button"
              onClick={() => setMoveOpen((o) => !o)}
            >
              {moveOpen ? "cancel move" : "move"}
            </Button>
            <Button
              variant="danger"
              type="button"
              onClick={() => setDeleteOpen(true)}
            >
              delete
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

      <PromptDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="rename file"
        label="file name"
        initialValue={fileName}
        confirmLabel="save"
        onConfirm={async (next) => {
          const res = await fetch(`/api/files/${fileId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: next }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? res.statusText);
          }
          setRenameOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="move to trash"
        message="Move this file to trash? It can be restored within 30 days."
        confirmLabel="trash"
        variant="danger"
        onConfirm={async () => {
          const res = await fetch(`/api/files/${fileId}/trash`, { method: "POST" });
          if (!res.ok) {
            throw new Error(`Delete failed: ${res.status}`);
          }
          setDeleteOpen(false);
          router.push("/");
        }}
      />
    </>
  );
}
