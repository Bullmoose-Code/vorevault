"use client";

import { useEffect, useRef } from "react";
import styles from "./Toast.module.css";

export type ToastVariant = "info" | "success" | "error";
export type ToastItem = { id: string; message: string; variant: ToastVariant };

type Props = {
  items: ToastItem[];
  onDismiss: (id: string) => void;
};

const DISMISS_MS = 3000;

export function Toast({ items, onDismiss }: Props) {
  const scheduled = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onDismissRef = useRef(onDismiss);

  // Keep onDismissRef in sync with the latest onDismiss
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    for (const t of items) {
      if (scheduled.current.has(t.id)) continue;
      scheduled.current.add(t.id);
      const timeoutId = setTimeout(() => {
        scheduled.current.delete(t.id);
        timersRef.current.delete(t.id);
        onDismissRef.current(t.id);
      }, DISMISS_MS);
      timersRef.current.set(t.id, timeoutId);
    }
    // Clean up: any id that was scheduled but no longer present should be forgotten
    // so its id can be reused later if the parent re-adds it.
    const presentIds = new Set(items.map((t) => t.id));
    for (const id of Array.from(scheduled.current)) {
      if (!presentIds.has(id)) {
        scheduled.current.delete(id);
        const timeoutId = timersRef.current.get(id);
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timersRef.current.delete(id);
        }
      }
    }
    return () => {
      // Only clear timers for items that are no longer in the list on unmount
      const presentIds = new Set(items.map((t) => t.id));
      for (const [id, timeoutId] of timersRef.current) {
        if (!presentIds.has(id)) {
          clearTimeout(timeoutId);
        }
      }
    };
  }, [items]);

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
