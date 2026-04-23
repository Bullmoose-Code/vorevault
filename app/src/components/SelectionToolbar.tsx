"use client";

import { useSelection } from "./SelectionContext";
import { Button } from "./Button";
import styles from "./SelectionToolbar.module.css";

export function SelectionToolbar() {
  const selection = useSelection();

  if (selection.size === 0) return null;

  return (
    <div className={styles.bar} role="toolbar" aria-label="selection actions">
      <span className={styles.count}>
        <strong>{selection.size}</strong> selected
      </span>
      <div className={styles.spacer} />
      <Button type="button" variant="ghost" onClick={() => selection.clear()}>
        clear
      </Button>
    </div>
  );
}
