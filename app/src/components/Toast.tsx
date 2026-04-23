"use client";

import { useEffect } from "react";
import styles from "./Toast.module.css";

export type ToastVariant = "info" | "success" | "error";
export type ToastItem = { id: string; message: string; variant: ToastVariant };

type Props = {
  items: ToastItem[];
  onDismiss: (id: string) => void;
};

const DISMISS_MS = 3000;

export function Toast({ items, onDismiss }: Props) {
  useEffect(() => {
    const timers = items.map((t) =>
      setTimeout(() => onDismiss(t.id), DISMISS_MS),
    );
    return () => { timers.forEach(clearTimeout); };
  }, [items, onDismiss]);

  if (items.length === 0) return null;

  return (
    <div className={styles.stack} aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`${styles.toast} ${styles[t.variant]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
