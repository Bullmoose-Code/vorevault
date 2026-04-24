"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSelection } from "./SelectionContext";

export const PAGINATE_FOCUS_KEY = "vv:focus-first-grid";

export function SelectionChrome() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams?.toString() ?? "";
  const selection = useSelection();

  // Clear selection when the pathname changes (not on search-param change, so
  // pagination doesn't nuke the selection).
  useEffect(() => {
    selection.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // After pagination (search params change with the flag set by PaginationLink),
  // restore keyboard focus to the first nav item on the new page.
  useEffect(() => {
    let flag: string | null = null;
    try { flag = sessionStorage.getItem(PAGINATE_FOCUS_KEY); } catch { /* storage blocked */ }
    if (flag !== "1") return;
    try { sessionStorage.removeItem(PAGINATE_FOCUS_KEY); } catch { /* ignore */ }
    // Wait a frame for the new grid to render before focusing.
    const raf = requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>("[data-nav-item]");
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, searchKey]);

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
