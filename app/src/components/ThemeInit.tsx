"use client";

import { useEffect } from "react";
import { readStored, applyChoice } from "@/lib/theme";

/**
 * Re-applies the user's stored theme on every page mount.
 *
 * The inline theme-init script in <head> (see layout.tsx) sets data-theme
 * during HTML parsing — so the first paint is correct. But React 19's
 * hydration occasionally hits an internal mismatch and runs "hydration
 * repair", which recreates <html> client-side without the data-theme
 * attribute the inline script had set. The result: a flash of correct
 * theme followed by a stuck-on-system-theme page.
 *
 * This component always mounts (sits in the root layout's body next to
 * SWRegister) and re-runs applyChoice on mount, restoring data-theme
 * after any repair. Renders nothing.
 */
export function ThemeInit() {
  useEffect(() => {
    applyChoice(readStored());
  }, []);
  return null;
}
