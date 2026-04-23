"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NewFolderDialog } from "./NewFolderDialog";
import styles from "./NewMenu.module.css";

export function NewMenu({ currentFolderId }: { currentFolderId: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
      >
        + new
      </button>
      {menuOpen && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => { setMenuOpen(false); setFolderDialogOpen(true); }}
          >
            new folder
          </button>
          <Link
            href="/upload"
            className={styles.item}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
          >
            upload file
          </Link>
        </div>
      )}
      <NewFolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        parentId={currentFolderId}
        parentName={null}
        onCreated={() => {
          setFolderDialogOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
