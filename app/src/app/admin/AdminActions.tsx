"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./AdminActions.module.css";

export function BanButton({ userId, isBanned }: { userId: string; isBanned: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const action = isBanned ? "unban" : "ban";
    if (!confirm(`${action} this user?`)) return;
    setLoading(true);
    await fetch("/api/admin/ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, banned: !isBanned }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className={`${styles.banBtn} ${isBanned ? styles.unban : styles.ban}`}
    >
      {loading ? "..." : isBanned ? "Unban" : "Ban"}
    </button>
  );
}
