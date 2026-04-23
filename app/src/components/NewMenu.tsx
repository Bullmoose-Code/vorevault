"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { FolderPickerModal } from "./FolderPickerModal";
import { NewFolderDialog } from "./NewFolderDialog";
import { useUploadProgress } from "./UploadProgressProvider";
import { splitRelativeDir, normalizePaths } from "@/lib/folder-paths";
import styles from "./NewMenu.module.css";

type Mode = "file" | "folder";

export function NewMenu({ currentFolderId }: { currentFolderId: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<Mode>("file");
  const [error, setError] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const pendingDestRef = useRef<string | null>(null);

  const router = useRouter();
  const { enqueue } = useUploadProgress();

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

  function startPick(mode: Mode) {
    setMenuOpen(false);
    setError(null);
    setPickerMode(mode);
    setPickerOpen(true);
  }

  function onPickerSelect(folderId: string | null) {
    pendingDestRef.current = folderId;
    setPickerOpen(false);
    queueMicrotask(() => {
      if (pickerMode === "file") fileInputRef.current?.click();
      else dirInputRef.current?.click();
    });
  }

  async function handleFiles(files: FileList | null, mode: Mode) {
    if (!files || files.length === 0) return;
    const dest = pendingDestRef.current;

    if (mode === "file") {
      for (const file of Array.from(files)) {
        enqueue(file, dest);
      }
      return;
    }

    // mode === "folder": build tree, POST, then enqueue per file with mapped id.
    const fileArr = Array.from(files);
    const dirs: string[] = [];
    const relDirs: string[] = [];
    for (const file of fileArr) {
      const rel = file.webkitRelativePath || file.name;
      const { dir } = splitRelativeDir(rel);
      relDirs.push(dir);
      if (dir) dirs.push(dir);
    }

    let paths: string[];
    try {
      paths = normalizePaths(dirs);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    let map: Record<string, string> = {};
    if (paths.length > 0) {
      try {
        const res = await fetch("/api/folders/tree", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parent_id: dest, paths }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(`couldn't create folder structure: ${body.error ?? res.statusText}`);
          return;
        }
        const data = await res.json();
        map = (data.folders as Record<string, string>) ?? {};
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const dir = relDirs[i];
      const target = dir ? (map[dir] ?? dest) : dest;
      enqueue(file, target);
    }
    router.refresh();
  }

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
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => startPick("file")}
          >
            upload file
          </button>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => startPick("folder")}
          >
            upload folder
          </button>
        </div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="choose folder"
        size="md"
      >
        <FolderPickerModal
          initialFolderId={currentFolderId}
          onCancel={() => setPickerOpen(false)}
          onSelect={onPickerSelect}
        />
      </Modal>

      <NewFolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        parentId={currentFolderId}
        parentName={null}
        onCreated={() => { setFolderDialogOpen(false); router.refresh(); }}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFiles(e.target.files, "file");
          e.target.value = "";
        }}
      />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        // TypeScript's JSX type doesn't include webkitdirectory, so we add it
        // via prop spread. Browsers read the attribute as present/not-present.
        {...({ webkitdirectory: "" } as Record<string, string>)}
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFiles(e.target.files, "folder");
          e.target.value = "";
        }}
      />
    </div>
  );
}
