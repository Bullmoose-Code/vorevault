"use client";

import { useEffect, useState } from "react";
import styles from "./StorageBar.module.css";

type Stats = { used_bytes: number; total_bytes: number; used_fraction: number };

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB_THRESHOLD = 1024 * GB; // ~1.1 TB — boundary for switching to TB label
const TB_DIVISOR = 1_000_000_000_000; // decimal TB so "11 TB" reads intuitively

function fmt(n: number, unit: string): string {
  // Strip ".0" for whole numbers; keep one decimal otherwise
  const s = n % 1 < 0.05 ? `${Math.round(n)}` : n.toFixed(1);
  return `${s} ${unit}`;
}

function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return fmt(bytes / KB, "KB");
  if (bytes < GB) return fmt(bytes / MB, "MB");
  if (bytes < TB_THRESHOLD) return fmt(bytes / GB, "GB");
  return fmt(bytes / TB_DIVISOR, "TB");
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
        {formatBytes(stats.used_bytes)} of {formatBytes(stats.total_bytes)}
      </div>
    </div>
  );
}
