"use client";

import { useEffect, useState } from "react";
import styles from "./StorageBar.module.css";

type Stats = { used_bytes: number; total_bytes: number; used_fraction: number };

function formatBytes(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(0)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes < TB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${(bytes / TB).toFixed(1)} TB`;
}

export function StorageBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/storage/stats");
        if (!res.ok) return;
        const data: Stats = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        /* swallow; bar stays in skeleton */
      }
    }
    void load();
    function onUploadDone() {
      void load();
    }
    window.addEventListener("vorevault:upload-done", onUploadDone);
    return () => {
      cancelled = true;
      window.removeEventListener("vorevault:upload-done", onUploadDone);
    };
  }, []);

  if (!stats) {
    return <div className={styles.wrap} aria-label="storage usage" />;
  }

  const pct = Math.max(0.005, Math.min(1, stats.used_fraction));
  return (
    <div className={styles.wrap} aria-label="storage usage">
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className={`vv-meta ${styles.label}`}>
        <strong>{formatBytes(stats.used_bytes)}</strong> of <strong>{formatBytes(stats.total_bytes)}</strong>
      </div>
    </div>
  );
}
