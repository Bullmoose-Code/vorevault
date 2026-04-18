"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./FolderPickerModal.module.css";

type Node = { id: string; name: string; parent_id: string | null };

type Props = {
  initialFolderId: string | null;
  onCancel: () => void;
  onSelect: (folderId: string | null) => void;
};

type ConflictError = { kind: "conflict"; name: string; existingId: string };
type OtherError = { kind: "other"; message: string };
type CreateError = ConflictError | OtherError;

export function FolderPickerModal({ initialFolderId, onCancel, onSelect }: Props) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(initialFolderId);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<CreateError | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/folders/tree")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setNodes(d.folders ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError((err as Error).message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Node>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const breadcrumb = useMemo(() => {
    const crumbs: Array<{ id: string | null; name: string }> = [
      { id: null, name: "Home" },
    ];
    let cursor: string | null = currentId;
    const path: Node[] = [];
    while (cursor) {
      const node = byId.get(cursor);
      if (!node) break;
      path.unshift(node);
      cursor = node.parent_id;
    }
    for (const n of path) crumbs.push({ id: n.id, name: n.name });
    return crumbs;
  }, [currentId, byId]);

  const children = useMemo(
    () => nodes.filter((n) => n.parent_id === currentId),
    [nodes, currentId],
  );

  function openCreate() {
    setCreating(true);
    setNewName("");
    setCreateError(null);
  }

  function closeCreate() {
    setCreating(false);
    setNewName("");
    setCreateError(null);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, parentId: currentId }),
      });
      if (res.ok || res.status === 201) {
        const folder = await res.json();
        const node: Node = {
          id: folder.id, name: folder.name, parent_id: currentId,
        };
        setNodes((prev) => [...prev, node]);
        setCurrentId(folder.id);
        closeCreate();
      } else if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setCreateError({
          kind: "conflict",
          name: trimmed,
          existingId: (body as { existingId?: string }).existingId ?? "",
        });
      } else {
        const body = await res.json().catch(() => ({}));
        setCreateError({
          kind: "other",
          message: (body as { error?: string }).error ?? res.statusText,
        });
      }
    } catch (err) {
      setCreateError({ kind: "other", message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  function useExisting(existingId: string) {
    setCurrentId(existingId);
    closeCreate();
  }

  if (loading) return <p className={styles.loading}>Loading folders…</p>;
  if (fetchError) return <p className={styles.error}>Couldn&apos;t load folders: {fetchError}</p>;

  return (
    <div className={styles.picker}>
      <nav className={styles.breadcrumbs} aria-label="Folder path">
        {breadcrumb.map((c, i) => (
          <span key={c.id ?? "root"} className={styles.crumb}>
            <button
              type="button"
              onClick={() => setCurrentId(c.id)}
              className={styles.crumbBtn}
              aria-current={i === breadcrumb.length - 1 ? "page" : undefined}
            >
              {c.name}
            </button>
            {i < breadcrumb.length - 1 && <span className={styles.crumbSep}>/</span>}
          </span>
        ))}
      </nav>

      <ul className={styles.list}>
        {children.length === 0 && !creating && (
          <li className={styles.empty}>No subfolders here.</li>
        )}
        {children.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setCurrentId(c.id)}
              className={styles.row}
            >
              <span className={styles.rowIcon} aria-hidden="true">📁</span>
              <span className={styles.rowName}>{c.name}</span>
              <span className={styles.rowArrow} aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>

      {!creating && (
        <button
          type="button"
          onClick={openCreate}
          className={styles.createBtn}
        >
          + Create folder here
        </button>
      )}

      {creating && (
        <form onSubmit={submitCreate} className={styles.createForm}>
          <label className={styles.createLabel}>
            New folder name
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              className={styles.createInput}
            />
          </label>
          {createError?.kind === "conflict" && (
            <div className={styles.createError}>
              <span>A folder named &ldquo;{createError.name}&rdquo; already exists here.</span>
              {createError.existingId && (
                <button
                  type="button"
                  onClick={() => useExisting(createError.existingId)}
                  className={styles.useExistingBtn}
                >
                  Use existing
                </button>
              )}
            </div>
          )}
          {createError?.kind === "other" && (
            <p className={styles.createError}>Create failed: {createError.message}</p>
          )}
          <div className={styles.createActions}>
            <button
              type="button"
              onClick={closeCreate}
              className={styles.createCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || newName.trim().length === 0}
              className={styles.createSubmit}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      <footer className={styles.footer}>
        <button type="button" onClick={onCancel} className={styles.footerCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentId)}
          className={styles.footerSelect}
        >
          Select
        </button>
      </footer>
    </div>
  );
}
