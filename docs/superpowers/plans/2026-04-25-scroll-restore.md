# Per-URL Scroll Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small `ScrollRestorer` client component to the shell layout that saves/restores the `.main` element's `scrollTop` per URL via sessionStorage — fixes both browser-back-loses-scroll and forward-nav-keeps-old-scroll bugs.

**Architecture:** A single client component using one `useEffect` keyed on `pathname` + `searchParams.toString()`. Cleanup function saves the OUTGOING URL's scroll position; effect body waits one `requestAnimationFrame` then restores the saved position for the INCOMING URL or resets to 0. The `.main` element gets `id="vv-main-scroll"` so the component finds it deterministically.

**Tech Stack:** Next.js 15 App Router (`next/navigation` hooks), TypeScript strict, Vitest + jsdom + React Testing Library.

---

## Spec

`docs/superpowers/specs/2026-04-25-scroll-restore-design.md`. The spec has the full motivation, behavior matrix, and architecture rationale.

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `app/src/components/ScrollRestorer.tsx` | **Create** | `"use client"` component; one `useEffect` saving/restoring `.main` scrollTop in sessionStorage |
| `app/src/components/ScrollRestorer.test.tsx` | **Create** | jsdom + mocked `next/navigation` tests covering all behavior matrix cases |
| `app/src/app/(shell)/layout.tsx` | **Modify** | Add `id="vv-main-scroll"` to the `<main>` element (line 52); mount `<ScrollRestorer />` next to `<SelectionChrome />` |

---

## Task 1: Create branch + `ScrollRestorer` component + tests

**Files:**
- Create: `app/src/components/ScrollRestorer.tsx`
- Create: `app/src/components/ScrollRestorer.test.tsx`

- [ ] **Step 1: Create the feature branch from latest main**

```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feat/scroll-restore
```

- [ ] **Step 2: Create the failing test file**

Create `app/src/components/ScrollRestorer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { ScrollRestorer } from "./ScrollRestorer";

// Mock next/navigation. The mock returns the current values from a module-
// scoped object so individual tests can mutate them and re-render to
// simulate route changes.
const navState: { pathname: string; search: string } = {
  pathname: "/",
  search: "",
};

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useSearchParams: () => ({
    toString: () => navState.search,
  }),
}));

beforeEach(() => {
  navState.pathname = "/";
  navState.search = "";
  sessionStorage.clear();
  // Add a fresh main element to the body before each test.
  const main = document.createElement("main");
  main.id = "vv-main-scroll";
  // Make it scrollable — give it a fixed height with overflowing content.
  Object.defineProperty(main, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  document.body.appendChild(main);
});

afterEach(() => {
  cleanup();
  document.getElementById("vv-main-scroll")?.remove();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function flushRaf() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("ScrollRestorer", () => {
  it("on first mount with no saved value, leaves scrollTop at 0", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    main.scrollTop = 0;
    render(<ScrollRestorer />);
    await flushRaf();
    expect(main.scrollTop).toBe(0);
  });

  it("on mount with a saved value for the current URL, restores it after rAF", async () => {
    sessionStorage.setItem("vv:scroll:/?", "500");
    const main = document.getElementById("vv-main-scroll")!;
    main.scrollTop = 0;
    render(<ScrollRestorer />);
    await flushRaf();
    expect(main.scrollTop).toBe(500);
  });

  it("on URL change, saves the OUTGOING URL's scrollTop before applying the new URL's", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    sessionStorage.setItem("vv:scroll:/b?", "200");

    // Mount on URL "/a".
    navState.pathname = "/a";
    navState.search = "";
    const { rerender } = render(<ScrollRestorer />);
    await flushRaf();

    // User scrolls.
    main.scrollTop = 750;

    // Navigate to "/b" by mutating the mock state and re-rendering.
    navState.pathname = "/b";
    navState.search = "";
    rerender(<ScrollRestorer />);
    await flushRaf();

    // Old URL's position was saved.
    expect(sessionStorage.getItem("vv:scroll:/a?")).toBe("750");
    // New URL's saved value was restored.
    expect(main.scrollTop).toBe(200);
  });

  it("on URL change with no saved value for the new URL, resets scrollTop to 0", async () => {
    const main = document.getElementById("vv-main-scroll")!;

    navState.pathname = "/a";
    const { rerender } = render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 600;

    navState.pathname = "/b";
    rerender(<ScrollRestorer />);
    await flushRaf();

    expect(main.scrollTop).toBe(0);
  });

  it("treats search-params change as a URL change (pagination)", async () => {
    const main = document.getElementById("vv-main-scroll")!;

    navState.pathname = "/";
    navState.search = "page=1";
    const { rerender } = render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 400;

    navState.search = "page=2";
    rerender(<ScrollRestorer />);
    await flushRaf();

    expect(sessionStorage.getItem("vv:scroll:/?page=1")).toBe("400");
    expect(main.scrollTop).toBe(0);
  });

  it("does nothing when the .main element is missing", async () => {
    document.getElementById("vv-main-scroll")?.remove();
    sessionStorage.setItem("vv:scroll:/?", "500");
    expect(() => render(<ScrollRestorer />)).not.toThrow();
    await flushRaf();
    // No errors logged.
  });

  it("swallows sessionStorage.setItem errors on cleanup", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 100;

    // Stub setItem to throw.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => cleanup()).not.toThrow();
    setItemSpy.mockRestore();
  });

  it("swallows sessionStorage.getItem errors on effect", async () => {
    const main = document.getElementById("vv-main-scroll")!;
    main.scrollTop = 0;

    // Stub getItem to throw.
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => render(<ScrollRestorer />)).not.toThrow();
    await flushRaf();
    expect(main.scrollTop).toBe(0); // falls back to reset
    getItemSpy.mockRestore();
  });

  it("on unmount, saves the current scrollTop", async () => {
    const main = document.getElementById("vv-main-scroll")!;

    navState.pathname = "/keep";
    const { unmount } = render(<ScrollRestorer />);
    await flushRaf();
    main.scrollTop = 333;

    unmount();
    expect(sessionStorage.getItem("vv:scroll:/keep?")).toBe("333");
  });
});
```

- [ ] **Step 3: Create the component stub so tests compile and fail meaningfully**

Create `app/src/components/ScrollRestorer.tsx`:

```tsx
"use client";

export function ScrollRestorer(): null {
  return null;
}
```

- [ ] **Step 4: Run the tests and confirm they fail**

```bash
cd /root/vorevault/app
npm test -- src/components/ScrollRestorer.test.tsx
```

Expected: tests run (compilation succeeds because the component exists), but most fail because the stub doesn't actually save or restore. Specifically:
- "on first mount with no saved value, leaves scrollTop at 0" → may pass (scrollTop already 0)
- "on mount with a saved value … restores it after rAF" → FAIL (scrollTop stays 0)
- All URL-change and unmount tests → FAIL (nothing saved)
- Storage-error tests → may pass (nothing happens, no throw)
- Missing-main test → may pass (nothing happens, no throw)

That's fine. The point is to confirm the test file compiles and the missing behavior is exercised.

- [ ] **Step 5: Implement `ScrollRestorer`**

Replace the contents of `app/src/components/ScrollRestorer.tsx` with:

```tsx
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
```

- [ ] **Step 6: Run the tests and confirm all 9 pass**

```bash
cd /root/vorevault/app
npm test -- src/components/ScrollRestorer.test.tsx
```

Expected: 9 passed.

- [ ] **Step 7: Run the full suite to confirm nothing else broke**

```bash
cd /root/vorevault/app
npm test
```

Expected: full suite green except known testcontainers/Docker-unavailable skips and the pre-existing `thumbnails.test.ts` ffprobe failure. Pass count goes up by 9.

- [ ] **Step 8: Commit**

```bash
cd /root/vorevault
git add app/src/components/ScrollRestorer.tsx app/src/components/ScrollRestorer.test.tsx
git commit -m "feat(scroll): ScrollRestorer client component with per-URL sessionStorage memory"
```

---

## Task 2: Wire `ScrollRestorer` into the shell layout

**Files:**
- Modify: `app/src/app/(shell)/layout.tsx`

- [ ] **Step 1: Add the import**

In `app/src/app/(shell)/layout.tsx`, add this import next to the other component imports near the top of the file (before `import styles from "./shell.module.css";`):

```ts
import { ScrollRestorer } from "@/components/ScrollRestorer";
```

- [ ] **Step 2: Mount `<ScrollRestorer />` next to `<SelectionChrome />`**

The current file has `<SelectionChrome />` at line 42 inside the `<SelectionProvider>` block. Add `<ScrollRestorer />` immediately after it.

Change:

```tsx
<SelectionProvider>
  <SelectionChrome />
  <GridChromeGate>
```

to:

```tsx
<SelectionProvider>
  <SelectionChrome />
  <ScrollRestorer />
  <GridChromeGate>
```

- [ ] **Step 3: Add `id="vv-main-scroll"` to the `<main>` element**

The current file has `<main className={styles.main}>` at line 52. Change it to:

```tsx
<main id="vv-main-scroll" className={styles.main}>
```

Leave everything else inside `<main>` unchanged.

- [ ] **Step 4: Build to verify no type errors**

```bash
cd /root/vorevault/app
npm run build
```

Expected: build succeeds with no type errors. The `(shell)/layout.tsx` route should compile.

- [ ] **Step 5: Run the full test suite again**

```bash
cd /root/vorevault/app
npm test
```

Expected: same green-except-known-skips state. No new failures.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/app/\(shell\)/layout.tsx
git commit -m "feat(shell): mount ScrollRestorer + tag main element for scroll restoration"
```

---

## Task 3: Push branch + open PR

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
cd /root/vorevault
git push -u origin feat/scroll-restore
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: per-URL scroll position memory in shell" --body "$(cat <<'EOF'
## Summary
- New `ScrollRestorer` client component (`app/src/components/ScrollRestorer.tsx`) saves the shell's `<main>` `scrollTop` to `sessionStorage` per URL, restores it on browser back/forward, and resets to 0 on forward navigation to a fresh URL.
- Mounted once in `(shell)/layout.tsx` next to `<SelectionChrome />`. The `<main>` element gets `id="vv-main-scroll"` so the component finds it deterministically.
- 9 jsdom component tests cover the behavior matrix (no-saved-value, saved-value, URL change save+restore, forward-nav reset, search-params change, missing element, storage errors on get/set, unmount save).

## Why
Implements **Theme 2.5** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`. The shell sets `html overflow: hidden` and scrolls inside a `.main` div, so the browser's built-in scroll restoration and Next's `<Link scroll>` default — both targeting `window` — are no-ops in VoreVault. This caused two bugs:

1. Browser back from a file detail page lost scroll position on the originating grid
2. Forward navigation between unrelated pages preserved scrollTop from the previous page (the `.main` element lives in the persistent shell layout)

Both fixed in one move.

Spec: `docs/superpowers/specs/2026-04-25-scroll-restore-design.md`
Plan: `docs/superpowers/plans/2026-04-25-scroll-restore.md`

## Test plan
- [x] 9 `ScrollRestorer` component tests
- [x] `npm run build` succeeds
- [ ] Browser smoke test on production after Watchtower deploy:
  - Scroll halfway down on home, click any file, hit browser back → grid restores to the same scroll position
  - Scroll halfway down on home, click a folder tile → folder page opens at the top (not at the previous scroll position)
  - Paginate `/?page=1` → `/?page=2` → page 2 starts at top → browser back → page 1 restores

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Wait for CI green, then merge**

```bash
gh pr checks 2>&1
```

When `ci` is `success`, merge:

```bash
gh pr merge --squash --delete-branch
```

Watchtower auto-deploys ~4 min after the deploy job.

- [ ] **Step 4: Production smoke test**

Once deployed, exercise on `https://vault.bullmoosefn.com`:

1. Open home, scroll halfway down.
2. Click any file → file detail page.
3. Browser back → confirm grid restores to where you were (not at the top).
4. From home (now restored), click a folder tile → confirm folder page opens at TOP (not at home's scroll position).
5. Paginate via the next-page link → confirm new page starts at top.
6. Browser back → confirm previous page restores to its prior scroll.

If anything fails, file a follow-up issue.
