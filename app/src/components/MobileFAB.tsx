"use client";

import Link from "next/link";
import styles from "./MobileFAB.module.css";

export function MobileFAB() {
  return (
    <Link href="/upload" className={styles.fab} aria-label="upload">
      +
    </Link>
  );
}
