"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./UserChip.module.css";

export function UserChip({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.chip}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.avatar}>
          {avatarUrl ? <img src={avatarUrl} alt="" /> : null}
        </span>
        <span>{username}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <a className={styles.item} href="/?mine=1" role="menuitem">
            My uploads
          </a>
          <form action="/api/auth/logout" method="post" className={styles.logoutForm}>
            <button type="submit" className={styles.item} role="menuitem">
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
