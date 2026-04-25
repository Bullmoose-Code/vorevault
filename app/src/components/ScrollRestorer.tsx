"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SCROLL_KEY_PREFIX = "vv:scroll:";

/**
 * Persists the shell <main> element's scrollTop per URL in sessionStorage.
 *
 * The shell layout's <main> is the actual scroll container (the window
 * doesn't scroll because the shell sets html overflow: hidden), so the
 * browser's built-in scroll restoration and Next's <Link scroll> default
 * are both no-ops here. This component fixes that — and also resets to 0
 * on forward navigation, which the persistent shell layout would
 * otherwise let leak between unrelated pages.
 *
 * Mount once inside the shell layout. Renders nothing.
 */
export function ScrollRestorer(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${SCROLL_KEY_PREFIX}${pathname}?${searchParams?.toString() ?? ""}`;

  useEffect(() => {
    const main = document.getElementById("vv-main-scroll");
    if (!main) return;

    // Wait one frame so the new server-rendered content is in place
    // before applying the saved scroll position (or the reset to 0).
    const raf = requestAnimationFrame(() => {
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem(key);
      } catch {
        /* storage blocked — fall through to the reset path */
      }
      main.scrollTop = saved ? parseInt(saved, 10) : 0;
    });

    return () => {
      cancelAnimationFrame(raf);
      // Save the current scroll position under the OUTGOING URL.
      try {
        sessionStorage.setItem(key, String(main.scrollTop));
      } catch {
        /* storage blocked — next visit just won't restore */
      }
    };
  }, [key]);

  return null;
}
