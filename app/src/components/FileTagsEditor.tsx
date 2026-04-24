"use client";
import { useState } from "react";
import { TagChip } from "./TagChip";
import styles from "./FileTagsEditor.module.css";

type Tag = { id: string; name: string };

export function FileTagsEditor({ fileId, initialTags }: { fileId: string; initialTags: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = draft.trim();
    if (!name) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/files/${fileId}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.reason ?? body.error ?? "couldn't add that tag");
        return;
      }
      const body = await res.json();
      setTags((prev) => {
        if (prev.some((t) => t.id === body.tag.id)) return prev;
        return [...prev, { id: body.tag.id, name: body.tag.name }]
          .sort((a, b) => a.name.localeCompare(b.name));
      });
      setDraft("");
    } finally { setBusy(false); }
  }

  async function remove(tag: Tag) {
    const prev = tags;
    setTags((p) => p.filter((t) => t.id !== tag.id));
    const res = await fetch(`/api/files/${fileId}/tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) setTags(prev);
  }

  return (
    <div className={styles.row}>
      {tags.map((t) => <TagChip key={t.id} name={t.name} onRemove={() => remove(t)} />)}
      <div className={styles.addGroup}>
        <input
          className={styles.input}
          placeholder="add tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          disabled={busy}
        />
        <button type="button" onClick={add} disabled={busy || !draft.trim()} className={styles.addBtn}>add</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
