"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [copied, setCopied] = useState(false);

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

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const btnStyle = (bg: string) => ({
    padding: "0.5rem 1rem",
    background: bg,
    color: "white",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    textDecoration: "none" as const,
  });

  return (
    <div style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" as const }}>
        <a href={`/api/stream/${fileId}`} download style={btnStyle("#5865F2")}>
          Download
        </a>

        <button onClick={handleToggleShare} disabled={sharing} style={btnStyle(shareUrl ? "#d9534f" : "#5cb85c")}>
          {sharing ? "..." : shareUrl ? "Revoke public link" : "Create public link"}
        </button>

        {isOwnerOrAdmin && (
          <button onClick={handleDelete} disabled={deleting} style={{ ...btnStyle("#d9534f"), opacity: deleting ? 0.6 : 1 }}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>

      {shareUrl && (
        <div style={{
          marginTop: "0.75rem",
          padding: "0.75rem",
          background: "#1a1a2e",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}>
          <code style={{ flex: 1, fontSize: "0.85rem", color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shareUrl}
          </code>
          <button onClick={handleCopy} style={btnStyle("#5865F2")}>
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      {error && <p style={{ color: "crimson", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}
