"use client";
import { useState, useTransition } from "react";
import styles from "./StarButton.module.css";

export function StarButton({
  fileId, initialBookmarked,
}: { fileId: string; initialBookmarked: boolean }) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      if (bookmarked) {
        const res = await fetch(`/api/bookmarks/${fileId}`, { method: "DELETE" });
        if (res.ok) setBookmarked(false);
      } else {
        const res = await fetch(`/api/bookmarks`, {
          method: "POST",
          body: JSON.stringify({ fileId }),
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) setBookmarked(true);
      }
    });
  }

  return (
    <button
      type="button"
      className={`${styles.star} ${bookmarked ? styles.on : ""}`}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this file"}
      onClick={toggle}
      disabled={pending}
    >
      ★
    </button>
  );
}
