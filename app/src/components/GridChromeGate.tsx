"use client";

import { usePathname } from "next/navigation";
import type React from "react";

// Wraps selection-grid chrome (keyboard nav, marquee, toolbar) and suppresses
// them on content routes that have no selectable items. Keep SelectionChrome
// outside this gate — it still needs to clear selection on route change.
const NON_GRID_PREFIXES = ["/f/"];

export function GridChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (NON_GRID_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  return <>{children}</>;
}
