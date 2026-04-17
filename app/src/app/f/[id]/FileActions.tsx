"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { ShareBanner } from "@/components/ShareBanner";
import styles from "./FileActions.module.css";

type Props = {
  fileId: string;
  isOwnerOrAdmin: boolean;
  initialShareUrl: string | null;
};

export function FileActions({ fileId, isOwnerOrAdmin, initialShareUrl }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState(initialShareUrl);
  const [sharing, setSharing] = useState(false);

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
          <Button
            variant="danger"
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        )}
        {error && <span className={styles.error}>{error}</span>}
      </div>
      {shareUrl && <ShareBanner url={shareUrl} />}
    </>
  );
}
