"use client";

import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";

type UploadState = {
  name: string;
  size: number;
  uploaded: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

export function UploadClient() {
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const dragRef = useRef<HTMLDivElement>(null);

  const startUpload = useCallback((file: File) => {
    setUploads((prev) => [
      ...prev,
      { name: file.name, size: file.size, uploaded: 0, status: "uploading" },
    ]);
    const idx = uploads.length;
    const upload = new tus.Upload(file, {
      endpoint: "/files/",
      retryDelays: [0, 1000, 3000, 5000],
      metadata: { filename: file.name, filetype: file.type || "application/octet-stream" },
      onError: (err) => {
        setUploads((s) =>
          s.map((u, i) => (i === idx ? { ...u, status: "error", error: String(err) } : u)),
        );
      },
      onProgress: (uploaded, total) => {
        setUploads((s) =>
          s.map((u, i) => (i === idx ? { ...u, uploaded } : u)),
        );
      },
      onSuccess: () => {
        setUploads((s) =>
          s.map((u, i) => (i === idx ? { ...u, status: "done", uploaded: u.size } : u)),
        );
      },
    });
    upload.start();
  }, [uploads.length]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) startUpload(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    for (const file of Array.from(e.target.files)) startUpload(file);
    e.target.value = "";
  };

  return (
    <div
      ref={dragRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      style={{
        border: "2px dashed #999",
        borderRadius: 12,
        padding: "3rem",
        textAlign: "center",
        marginTop: "1rem",
      }}
    >
      <p>Drop files here, or</p>
      <label
        style={{
          display: "inline-block",
          padding: "0.75rem 1.5rem",
          background: "#5865F2",
          color: "white",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Choose files
        <input type="file" multiple style={{ display: "none" }} onChange={onPick} />
      </label>

      {uploads.length > 0 && (
        <ul style={{ textAlign: "left", marginTop: "2rem", listStyle: "none", padding: 0 }}>
          {uploads.map((u, i) => (
            <li key={i} style={{ marginBottom: "1rem" }}>
              <strong>{u.name}</strong> — {Math.round((u.uploaded / u.size) * 100) || 0}% [{u.status}]
              {u.error && <div style={{ color: "crimson" }}>{u.error}</div>}
              <progress value={u.uploaded} max={u.size} style={{ width: "100%" }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
