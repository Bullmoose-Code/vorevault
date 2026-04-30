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
    // Read the stored preference, sync local state, AND re-apply data-theme.
    // The inline theme-init script in <head> sets data-theme during HTML
    // parsing; React's hydration sometimes removes it (when "hydration
    // repair" recreates parts of the tree). Re-applying here makes the
    // attribute survive any hydration churn.
    const stored = readStored();
    setChoice(stored);
    applyChoice(stored);
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
