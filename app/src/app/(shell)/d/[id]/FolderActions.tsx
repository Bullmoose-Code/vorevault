"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialogs";
import { PromptDialog } from "@/components/Dialogs";
import type { FolderRow } from "@/lib/folders";

export function FolderActions({
  folder,
  canManage,
}: {
  folder: FolderRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (!canManage) return null;

  return (
    <>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button variant="ghost" type="button" onClick={() => setRenameOpen(true)}>
          rename
        </Button>
        <Button variant="danger" type="button" onClick={() => setDeleteOpen(true)}>
          delete
        </Button>
      </div>

      <PromptDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="rename folder"
        label="folder name"
        initialValue={folder.name}
        confirmLabel="save"
        onConfirm={async (next) => {
          const res = await fetch(`/api/folders/${folder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: next }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? res.statusText);
          }
          setRenameOpen(false);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="delete folder"
        message={`Delete "${folder.name}"? Its contents will move to the parent.`}
        confirmLabel="delete"
        variant="danger"
        onConfirm={async () => {
          const res = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? res.statusText);
          }
          setDeleteOpen(false);
          const dest = folder.parent_id ? `/d/${folder.parent_id}` : "/";
          router.push(dest);
        }}
      />
    </>
  );
}
