"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialogs";

export function EmptyTrashButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="danger" type="button" onClick={() => setOpen(true)}>
        empty trash
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="empty trash"
        message="Permanently delete every item in trash? This cannot be undone."
        confirmLabel="delete forever"
        variant="danger"
        onConfirm={async () => {
          const res = await fetch("/api/trash/empty", { method: "POST" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error ?? res.statusText);
          }
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
