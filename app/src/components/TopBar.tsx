"use client";

import { useEffect, useState } from "react";
import { MooseLogo } from "./MooseLogo";
import { Pill } from "./Pill";
import { UserChip } from "./UserChip";
import { SearchBar } from "./SearchBar";
import styles from "./TopBar.module.css";

export function TopBar({
  username,
  avatarUrl,
  showUpload = true,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  showUpload?: boolean;
  isAdmin?: boolean;
}) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileSearchOpen]);

  return (
    <>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/">
          <MooseLogo size="header" />
          vorevault
        </a>
        <div className={styles.searchDesktop}>
          <SearchBar variant="inline" />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.searchIconBtn}
            aria-label="Open search"
            onClick={() => setMobileSearchOpen(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
          {showUpload && (
            <Pill
              variant="primary"
              href="/upload"
              className={styles.uploadPill}
              aria-label="Upload"
            >
              <span className={styles.uploadIcon} aria-hidden="true">↑</span>
              <span className={styles.uploadLabel}>Upload</span>
            </Pill>
          )}
          <UserChip username={username} avatarUrl={avatarUrl} isAdmin={isAdmin} />
        </div>
      </header>

      {mobileSearchOpen && (
        <div
          className={styles.searchOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div className={styles.searchOverlayHeader}>
            <button
              type="button"
              className={styles.searchOverlayClose}
              aria-label="Close search"
              onClick={() => setMobileSearchOpen(false)}
            >
              ×
            </button>
            <SearchBar
              variant="overlay"
              autoFocus
              onHitSelected={() => setMobileSearchOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
