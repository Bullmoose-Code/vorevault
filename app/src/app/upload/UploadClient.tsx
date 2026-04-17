"use client";

import { useCallback, useState } from "react";
import * as tus from "tus-js-client";
import { DropZone } from "@/components/DropZone";
import { UploadRow, type UploadState } from "@/components/UploadRow";
import styles from "./UploadClient.module.css";

export function UploadClient() {
  const [uploads, setUploads] = useState<UploadState[]>([]);

  const startUpload = useCallback((file: File) => {
    setUploads((prev) => {
      const idx = prev.length;
      const next: UploadState = {
        name: file.name,
        size: file.size,
        uploaded: 0,
        status: "uploading",
      };
      const upload = new tus.Upload(file, {
        endpoint: "/files/",
        retryDelays: [0, 1000, 3000, 5000],
        metadata: {
          filename: file.name,
          filetype: file.type || "application/octet-stream",
        },
        onError: (err) => {
          setUploads((s) =>
            s.map((u, i) => (i === idx ? { ...u, status: "error", error: String(err) } : u)),
          );
        },
        onProgress: (uploaded) => {
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
      return [...prev, next];
    });
  }, []);

  const doneCount = uploads.filter((u) => u.status === "done").length;
  const totalBytes = uploads.reduce((sum, u) => sum + u.size, 0);

  return (
    <>
      <DropZone onFiles={(files) => files.forEach(startUpload)} />

      {uploads.length > 0 && (
        <>
          <div className={styles.uploadsHeader}>
            <h2>In flight</h2>
            <div className={styles.summary}>
              <strong>{doneCount} of {uploads.length} done</strong> · total {formatTotalBytes(totalBytes)}
            </div>
          </div>
          <div className={styles.grid}>
            {uploads.map((u, i) => (
              <UploadRow key={i} upload={u} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function formatTotalBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
