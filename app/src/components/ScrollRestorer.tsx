"use client";

import { useLayoutEffect } from "react";
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
 * Uses useLayoutEffect (not useEffect+rAF) so the scroll restore happens
 * before the browser paints — assigning scrollTop forces a synchronous
 * layout flush, so the restored value uses post-layout geometry without
 * a one-frame flicker at the top.
 *
 * Mount once inside the shell layout, wrapped in a <Suspense> boundary
 * because useSearchParams forces a CSR bailout otherwise.
 */
export function ScrollRestorer(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${SCROLL_KEY_PREFIX}${pathname}?${searchParams?.toString() ?? ""}`;

  useLayoutEffect(() => {
    const main = document.getElementById("vv-main-scroll");
    if (!main) return;

    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(key);
    } catch {
      /* storage blocked — fall through to the reset path */
    }
    const n = saved ? parseInt(saved, 10) : 0;
    // Guard against malformed values (manually-edited sessionStorage,
    // future format changes) — NaN would silently coerce to 0 anyway,
    // but being explicit keeps the intent clear.
    main.scrollTop = Number.isFinite(n) ? n : 0;

    return () => {
      try {
        sessionStorage.setItem(key, String(main.scrollTop));
      } catch {
        /* storage blocked — next visit just won't restore */
      }
    };
  }, [key]);

  return null;
}
