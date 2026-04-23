"use client";

import { useRouter } from "next/navigation";
import type { FolderRow } from "@/lib/folders";

export function FolderActions({
  folder,
  canManage,
}: {
  folder: FolderRow;
  canManage: boolean;
}) {
  const router = useRouter();

  if (!canManage) return null;

  async function handleRename() {
    const newName = window.prompt("New folder name:", folder.name);
    if (!newName || newName.trim() === folder.name) return;
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(`Rename failed: ${(data as { error?: string }).error ?? res.statusText}`);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete folder "${folder.name}"? Its contents will be moved to the parent.`)) return;
    const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    if (res.ok) {
      const dest = folder.parent_id ? `/d/${folder.parent_id}` : "/";
      router.push(dest);
    } else {
      const data = await res.json().catch(() => ({}));
      window.alert(`Delete failed: ${(data as { error?: string }).error ?? res.statusText}`);
    }
  }

  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <button onClick={handleRename}>Rename</button>
      <button onClick={handleDelete}>Delete</button>
    </div>
  );
}
