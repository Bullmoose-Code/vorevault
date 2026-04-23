"use client";

import { useState, type ReactNode } from "react";
import styles from "./VaultSection.module.css";

export function VaultSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.label}
        aria-expanded={open}
        aria-controls="vv-vault-tree"
        onClick={() => setOpen((o) => !o)}
      >
        <span>vault</span>
        <span className={styles.caret} aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div id="vv-vault-tree" className={styles.tree}>
          {children}
        </div>
      )}
    </div>
  );
}
