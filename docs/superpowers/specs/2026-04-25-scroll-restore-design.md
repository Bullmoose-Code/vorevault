# Per-URL Scroll Restoration — Design

Implements **Theme 2.5** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`. Wraps up Theme 2 (Navigation polish) by fixing two scroll-position bugs in the shell.

## Motivation

The shell layout has its own scroll container (`.main` is `overflow-y: auto`, the shell itself is `height: 100vh; overflow: hidden`). The window doesn't scroll. This means the browser's built-in scroll restoration and Next.js's default `<Link scroll>` behavior — both of which target `window` — are no-ops in VoreVault.

Two visible bugs result:

1. **Browser back doesn't restore scroll.** Click a file from a deep-scrolled grid → file detail page → browser back → grid is at the top.
2. **Forward navigation doesn't reset to top.** `.main` lives in the persistent shell layout, so its `scrollTop` carries between unrelated pages. Click a folder tile while scrolled halfway down on home → the folder page opens scrolled halfway down.

Bug #2 is the more visible one and was not in the original 2.5 framing; both ship together since the fix is the same.

## Goal

When the user navigates between pages inside the shell:
- If the destination URL has a saved scroll position from earlier in this tab session → restore it (browser back / forward through history)
- Otherwise → reset `.main` to `scrollTop = 0`

## Architecture

A single new client component `ScrollRestorer` in the shell layout. It listens for URL changes via Next.js's `usePathname` + `useSearchParams` hooks and uses `sessionStorage` keyed by full URL (path + search) to remember scroll positions.

Mechanism (one `useEffect` keyed on the URL):
- **Effect body** (runs after URL change): wait one `requestAnimationFrame` for the new server-rendered content to render, then either restore the saved `scrollTop` for this URL or set it to 0.
- **Cleanup function** (runs before the next effect, with closure capturing the OUTGOING URL): save the current `.main` `scrollTop` to `sessionStorage` keyed by that outgoing URL.

This pattern correctly handles the two-bug fix in one move:
- Forward navigation to a fresh URL → cleanup saves old URL's position; effect on new URL finds nothing in storage → reset to 0
- Browser back to a URL we've visited → cleanup saves old URL's position; effect on new URL finds the saved value → restore

The `.main` element gets `id="vv-main-scroll"` so the component finds it deterministically (the existing CSS class is module-scoped).

## Scope

**In scope:**
- The shell's `.main` element scroll position
- Every grid page inside the shell (home, folder detail, recent, mine, starred, search, trash, file detail, admin, etc. — the layout wraps them all)

**Out of scope:**
- Window scroll (irrelevant — window doesn't scroll in this layout)
- Inner scroll containers below `.main` (e.g., a future modal with its own scroll) — those would each need their own restorer if needed
- Cross-tab scroll memory (sessionStorage is per-tab on purpose; no privacy/lifetime headache)
- LRU eviction of saved positions (sessionStorage is bounded by tab lifetime; ~50–100 bytes per URL is fine for typical use)

## Behavior matrix

| Scenario | Behavior |
|---|---|
| First visit to URL `A` in a tab | No saved value → `scrollTop = 0` (already there from fresh mount, no-op) |
| Scroll on `A`, navigate to `B` | Cleanup saves `A`'s scrollTop; effect on `B` checks storage → none → reset to 0 |
| Scroll on `B`, browser back to `A` | Cleanup saves `B`'s scrollTop; effect on `A` reads saved value → restore |
| Scroll on `A` (now restored), browser forward to `B` | Cleanup updates `A`'s scrollTop; effect on `B` reads its saved value → restore |
| Pagination `?page=1` → `?page=2` | Treated as URL change (search params differ); old scroll saved under `?page=1`, new starts at top |
| `.main` element missing (e.g., outside shell layout — login page) | `getElementById` returns null → effect early-exits; no errors |
| `sessionStorage` blocked (private mode, quota exceeded) | `try/catch` swallows the error; restore is a no-op (page starts at top), save is a no-op (next visit won't restore) |

## Component contract

```ts
// app/src/components/ScrollRestorer.tsx
"use client";

export function ScrollRestorer(): null;
```

Renders nothing. Mount once in the shell layout. Self-contained — no props, no context dependencies.

## Layout integration

`app/src/app/(shell)/layout.tsx` already wraps everything in a `<main className={styles.main}>...</main>` (or equivalent). The change is:

1. Add `id="vv-main-scroll"` to that `<main>` element.
2. Mount `<ScrollRestorer />` somewhere inside the shell tree (placement doesn't matter — it has no UI; alongside `<SelectionChrome />` is the natural spot).

## Testing

Component test (`ScrollRestorer.test.tsx`) using jsdom + `cleanup()` + a mocked `next/navigation`:

1. **First mount, no saved value** → `scrollTop` set to 0 (after rAF)
2. **First mount, saved value present** → `scrollTop` restored to saved value (after rAF)
3. **URL change** → old URL's scrollTop is saved before new URL's effect runs
4. **No `.main` element** → component renders without errors and does nothing
5. **`sessionStorage.setItem` throws** → cleanup swallows the error, no console noise
6. **`sessionStorage.getItem` throws** → effect swallows the error, falls back to scrollTop = 0
7. **Unmount** → final cleanup saves current scrollTop

No integration test needed — the component has no DB or network dependencies.

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `app/src/components/ScrollRestorer.tsx` | **Create** | Client component implementing the save-restore-or-reset logic |
| `app/src/components/ScrollRestorer.test.tsx` | **Create** | jsdom + mocked `next/navigation` component tests |
| `app/src/app/(shell)/layout.tsx` | **Modify** | Add `id="vv-main-scroll"` to the `<main>` element + mount `<ScrollRestorer />` |

CSS in `shell.module.css` is unchanged — the id is added in the layout JSX, not the stylesheet.

## Why one `useEffect` + cleanup pattern (vs. `popstate` listener)

A `popstate` listener would let us differentiate "back/forward" from "fresh navigation," but the cleanup pattern doesn't need to — by saving on every navigation and restoring whenever a saved value exists, we get the correct behavior in both cases without parsing history events. Simpler code, fewer edge cases, no concerns about Next.js's internal history management.
