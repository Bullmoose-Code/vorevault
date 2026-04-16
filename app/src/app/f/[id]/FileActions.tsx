"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FileActions({ fileId, isOwnerOrAdmin }: { fileId: string; isOwnerOrAdmin: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div style={{ marginTop: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
      <a
        href={`/api/stream/${fileId}`}
        download
        style={{
          padding: "0.5rem 1rem",
          background: "#5865F2",
          color: "white",
          textDecoration: "none",
          borderRadius: 6,
        }}
      >
        Download
      </a>
      {isOwnerOrAdmin && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            padding: "0.5rem 1rem",
            background: "#d9534f",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: deleting ? "not-allowed" : "pointer",
            opacity: deleting ? 0.6 : 1,
          }}
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      )}
      {error && <span style={{ color: "crimson" }}>{error}</span>}
    </div>
  );
}
