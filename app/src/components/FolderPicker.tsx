"use client";
import { useEffect, useState } from "react";
import styles from "./FolderPicker.module.css";

type Node = { id: string; name: string; parent_id: string | null };

export function FolderPicker({
  value, onChange,
}: { value: string | null; onChange: (folderId: string | null) => void }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/folders/tree").then((r) => r.json()).then((d) => setNodes(d.folders ?? []));
  }, []);

  const selected = nodes.find((n) => n.id === value);

  async function createAt(parentId: string | null) {
    const name = prompt("New folder name:");
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST", body: JSON.stringify({ name, parentId }),
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      const folder = await res.json();
      setNodes((prev) => [...prev, folder]);
      onChange(folder.id);
    } else if (res.status === 409) {
      const body = await res.json();
      if (confirm(`A folder named "${name}" already exists here. Use it?`)) onChange(body.existingId);
    } else {
      alert(`Create failed: ${res.status}`);
    }
  }

  return (
    <div className={styles.picker}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        Folder: <strong>{selected ? selected.name : "None (root)"}</strong>
      </button>
      {open && (
        <ul className={styles.tree}>
          <li>
            <button type="button" onClick={() => { onChange(null); setOpen(false); }}>
              None (root)
            </button>
            <button type="button" className={styles.add} onClick={() => createAt(null)}>+ new</button>
          </li>
          {nodes.filter((n) => n.parent_id === null).map((root) => (
            <FolderBranch key={root.id} node={root} all={nodes}
              onPick={(id) => { onChange(id); setOpen(false); }}
              onCreate={(parentId) => createAt(parentId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FolderBranch({
  node, all, onPick, onCreate,
}: {
  node: Node; all: Node[];
  onPick: (id: string) => void;
  onCreate: (parentId: string) => void;
}) {
  const children = all.filter((n) => n.parent_id === node.id);
  return (
    <li>
      <button type="button" onClick={() => onPick(node.id)}>{node.name}</button>
      <button type="button" onClick={() => onCreate(node.id)}>+ new inside</button>
      {children.length > 0 && (
        <ul>
          {children.map((c) => <FolderBranch key={c.id} node={c} all={all} onPick={onPick} onCreate={onCreate} />)}
        </ul>
      )}
    </li>
  );
}
