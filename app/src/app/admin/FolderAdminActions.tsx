"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FolderRow } from "@/lib/folders";

export function FolderAdminActions({ folder }: { folder: FolderRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRename() {
    const name = window.prompt("New folder name:", folder.name);
    if (!name || name === folder.name) return;
    setBusy(true);
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json" },
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else window.alert(`Rename failed: ${res.status}`);
  }

  async function onDelete() {
    if (!window.confirm(`Delete folder "${folder.name}"? Contents move to the parent folder.`)) return;
    setBusy(true);
    const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else window.alert(`Delete failed: ${res.status}`);
  }

  return (
    <>
      <button type="button" onClick={onRename} disabled={busy}>rename</button>{" "}
      <button type="button" onClick={onDelete} disabled={busy}>delete</button>
    </>
  );
}
