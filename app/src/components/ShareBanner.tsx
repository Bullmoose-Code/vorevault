"use client";

import { useState } from "react";
import styles from "./ShareBanner.module.css";

export function ShareBanner({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.banner}>
      <span className={styles.label}>Public link</span>
      <code className={styles.url}>{url}</code>
      <button type="button" className={styles.copyBtn} onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
