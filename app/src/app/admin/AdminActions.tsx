"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
      onClick={toggle}
      disabled={loading}
      style={{
        padding: "0.25rem 0.5rem",
        background: isBanned ? "#5cb85c" : "#d9534f",
        color: "white",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: "0.75rem",
      }}
    >
      {loading ? "..." : isBanned ? "Unban" : "Ban"}
    </button>
  );
}
