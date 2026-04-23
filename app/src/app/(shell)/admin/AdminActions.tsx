"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/Dialogs";
import styles from "./AdminActions.module.css";

export function BanButton({ userId, isBanned }: { userId: string; isBanned: boolean }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={`${styles.banBtn} ${isBanned ? styles.unban : styles.ban}`}
      >
        {isBanned ? "Unban" : "Ban"}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={isBanned ? "unban user" : "ban user"}
        message={`This will ${isBanned ? "unban" : "ban"} this user. Continue?`}
        confirmLabel={isBanned ? "unban" : "ban"}
        variant={isBanned ? "primary" : "danger"}
        onConfirm={async () => {
          const res = await fetch("/api/admin/ban", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, banned: !isBanned }),
          });
          if (!res.ok) {
            throw new Error(`Request failed: ${res.status}`);
          }
          setConfirmOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
