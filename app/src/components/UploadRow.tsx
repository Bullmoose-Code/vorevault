"use client";

import { ProgressBar } from "./ProgressBar";
import styles from "./UploadRow.module.css";

export type UploadState = {
  name: string;
  size: number;
  uploaded: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function UploadRow({ upload }: { upload: UploadState }) {
  const pct = upload.size > 0 ? Math.round((upload.uploaded / upload.size) * 100) : 0;
  const barVariant = upload.status === "error" ? "red" : upload.status === "done" ? "green" : "orange";
  const statusLabel = upload.status === "pending" ? "uploading" : upload.status;

  return (
    <div className={styles.row}>
      <div className={styles.top}>
        <span className={styles.name}>{upload.name}</span>
        <span className={styles.size}>{formatBytes(upload.size)}</span>
        <span className={`${styles.status} ${styles[statusLabel]}`}>{statusLabel}</span>
      </div>
      <div className={styles.bottom}>
        <ProgressBar pct={pct} variant={barVariant} />
        <span className={styles.pct}>{pct}%</span>
        {upload.error && <span className={styles.speed}>{upload.error}</span>}
      </div>
    </div>
  );
}
