"use client";

import { useEffect, useState } from "react";
import { readStored, writeStored, applyChoice, cycleChoice, type ThemeChoice } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

const LABEL: Record<ThemeChoice, string> = {
  system: "theme: system",
  light: "theme: light",
  dark: "theme: dark",
};

const GLYPH: Record<ThemeChoice, string> = {
  system: "◐",
  light: "☀",
  dark: "☾",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readStored());
  }, []);

  function onClick() {
    const next = cycleChoice(choice);
    setChoice(next);
    writeStored(next);
    applyChoice(next);
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={onClick}
      aria-label={LABEL[choice]}
    >
      <span className={styles.glyph} aria-hidden="true">{GLYPH[choice]}</span>
      <span className={styles.text}>{LABEL[choice]}</span>
    </button>
  );
}
