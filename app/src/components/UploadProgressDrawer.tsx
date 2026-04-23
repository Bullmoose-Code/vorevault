"use client";

import { useEffect, useRef, useState } from "react";
import { useUploadProgress } from "./UploadProgressProvider";
import { ProgressBar } from "./ProgressBar";
import styles from "./UploadProgressDrawer.module.css";

function pct(u: { uploaded: number; size: number }): number {
  if (u.size <= 0) return 0;
  return Math.round((u.uploaded / u.size) * 100);
}

export function UploadProgressDrawer() {
  const { uploads, cancel } = useUploadProgress();
  const [collapsed, setCollapsed] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inflight = uploads.filter((u) => u.status === "uploading" || u.status === "pending");
  const done = uploads.filter((u) => u.status === "done").length;
  const errored = uploads.filter((u) => u.status === "error").length;

  useEffect(() => {
    // Always clear any pending collapse timer before deciding what to do next.
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    if (uploads.length === 0) return;
    if (inflight.length === 0) {
      collapseTimer.current = setTimeout(() => setCollapsed(true), 5000);
      return () => {
        if (collapseTimer.current) {
          clearTimeout(collapseTimer.current);
          collapseTimer.current = null;
        }
      };
    }
    setCollapsed(false);
    return undefined;
  }, [uploads.length, inflight.length]);

  if (uploads.length === 0) return null;

  const headerLabel =
    inflight.length > 0
      ? `${inflight.length} uploading${done ? ` · ${done} done` : ""}${errored ? ` · ${errored} failed` : ""}`
      : `uploads · ${done} done${errored ? ` · ${errored} failed` : ""}`;

  return (
    <aside className={styles.drawer} aria-label="upload progress">
      <header className={styles.header}>
        <button
          type="button"
          className={styles.headerPill}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {headerLabel}
        </button>
      </header>
      {!collapsed && (
        <ul className={styles.list}>
          {uploads.map((u) => (
            <li key={u.id} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.name}>{u.name}</span>
                <span className={`${styles.status} ${styles[u.status]}`}>{u.status}</span>
              </div>
              <div className={styles.rowBottom}>
                <ProgressBar
                  pct={pct(u)}
                  variant={u.status === "error" ? "red" : u.status === "done" ? "green" : "orange"}
                />
                <span className={styles.pct}>{pct(u)}%</span>
                {u.status === "uploading" && (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => cancel(u.id)}
                    aria-label={`cancel ${u.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
              {u.error && <div className={styles.errorMsg}>{u.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
