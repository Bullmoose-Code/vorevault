"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./UserChip.module.css";
import { ThemeToggle } from "./ThemeToggle";

export function UserChip({
  username,
  avatarUrl,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
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
    function onFocusOut(e: FocusEvent) {
      if (!ref.current) return;
      const next = e.relatedTarget as Node | null;
      if (!next || !ref.current.contains(next)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    ref.current?.addEventListener("focusout", onFocusOut);
    const wrap = ref.current;
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      wrap?.removeEventListener("focusout", onFocusOut);
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
        <span className={styles.avatar} aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : username.charAt(0)}
        </span>
        <span className={styles.username}>{username}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.header}>@{username}</div>
          <ThemeToggle />
          <div className={styles.divider} />
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
