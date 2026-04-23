"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSelection } from "./SelectionContext";

export function SelectionChrome() {
  const pathname = usePathname();
  const selection = useSelection();

  // Clear selection when navigating.
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc clears selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && selection.size > 0) {
        selection.clear();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection]);

  return null;
}
