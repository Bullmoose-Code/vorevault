"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { NewMenu } from "./NewMenu";
import styles from "./MobileFAB.module.css";

export function MobileFAB({ currentFolderId }: { currentFolderId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.fab}
        aria-label="new"
        onClick={() => setOpen(true)}
      >
        +
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="new" size="sm">
        <div className={styles.menuHost}>
          <NewMenu currentFolderId={currentFolderId} />
        </div>
      </Modal>
    </>
  );
}
