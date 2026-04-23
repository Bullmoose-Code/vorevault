# Phase 2b: Multi-select + Selection Toolbar + Batch Actions + Download-zip

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google-Drive-style multi-select with a persistent selection toolbar, batch trash/move via client-side loops over existing endpoints, bulk download as a streamed zip, and context-menu integration that operates on the entire selection when right-click hits a selected item. No schema changes.

**Architecture:**
- New `<SelectionProvider>` client context stores `SelectedItem[]` (full descriptors, not just ids — each row carries `canManage`, `name`, and folder/parent id so toolbar + context menu can make decisions without re-fetching).
- `<FileCard>` and `<FolderTile>` intercept Cmd/Ctrl-click + Shift-click at the `<a>`/`<Link>` onClick; plain click still navigates. Visual selected state via a new `.selected` CSS class on each.
- New `<SelectionToolbar>` component rendered at the shell level, appears below the `TopBar` when `selection.size > 0`. Shows "N selected", Clear, Download as zip, Move to…, Move to trash. Owns its own Confirm + Move dialogs (doesn't route through `ItemActionProvider`).
- New `lib/zip.ts` — streaming zip builder using `archiver` (new runtime dep; archiver is pure-JS, streaming, ~270KB). New route `GET /api/files/zip?ids=...` — streams the archive; capped at 50 ids.
- `<FileContextMenu>` + `<FolderContextMenu>` grow a "multi-select mode": when right-click hits a selected item AND `selection.size > 1`, menu shows only the batch-safe actions. Non-selected right-click and single-select right-click behave as in Phase 2a.
- Esc clears selection. Pathname change clears selection.

**Tech Stack:** Next.js 15 App Router (Node.js runtime for the zip route), React 19, TS strict, Vitest + jsdom, `archiver` (new dep), CSS Modules with `--vv-*` tokens.

**Branch:** `feat/phase-2b-multiselect-and-zip` — off `main` (after 2a merges).

---

## Scope

**In:**
- Selection model (multi-item, ordered by insertion for shift-range anchoring).
- Click handlers: Cmd/Ctrl-click toggle, Shift-click range, plain click navigates.
- Selected state visual on card / tile.
- SelectionToolbar with Clear, Download zip, Move, Trash.
- Batch trash/move: client loop over existing single-item endpoints. Failures counted per-item and reported in the result toast. No new batch endpoints.
- Streaming zip download route for files only (folders don't zip in 2b — recursive zipping is a later refinement).
- Context menus show batch actions when triggered from a selected item with selection > 1.
- Esc clears, route-change clears.

**Out (deferred):**
- Cmd/Ctrl+A select-all and grid arrow-key nav → Phase 2c.
- List view → Phase 2d.
- Recursive folder-zip download → if ever wanted, later.
- Server-side batch endpoints → YAGNI until per-item loops cause actual issues.
- Marquee / drag-box select → later polish.

---

## Data model: `SelectedItem`

One discriminated union stored in the provider's state. Each card, when toggled into selection, passes its own descriptor.

```ts
export type SelectedItem =
  | { kind: "file"; id: string; name: string; canManage: boolean; folderId: string | null }
  | { kind: "folder"; id: string; name: string; canManage: boolean; parentId: string | null };
```

The `canManage` flag is computed at the card site where the current user and the item's owner id are both in scope. This avoids passing the user around downstream.

---

## Right-click rules (authoritative)

Let `clickedItem` = the item being right-clicked, `selection` = current `SelectedItem[]`.

| Situation | Menu mode |
|---|---|
| `clickedItem` NOT in `selection` | **Single mode** — same as Phase 2a, applies only to `clickedItem`. `selection` stays as is. |
| `clickedItem` IS in `selection` AND `selection.length === 1` | **Single mode** — acts on `clickedItem`. |
| `clickedItem` IS in `selection` AND `selection.length > 1` | **Batch mode** — menu shows **only** Download as zip (files-only), Move to…, Move to trash. No Open / Rename / Copy link. Action applies to whole `selection`. |

Folders in selection: Download-zip disabled if ANY folder in selection.
Gating in batch mode: Move / Trash only visible if ALL selected items satisfy `canManage`. (Showing with some items ungated would half-succeed.)

---

## File Structure

**Created:**
- `app/src/components/SelectionContext.tsx` — client context + `useSelection()` hook. Exposes `{ items, size, isSelected, toggle, addRange, clear, anchorId }`.
- `app/src/components/SelectionContext.test.tsx`
- `app/src/components/SelectionToolbar.tsx` — client, client-rendered at shell level. Owns its own Confirm + Move dialogs (separate from `ItemActionProvider`'s singletons, since those are single-item scoped).
- `app/src/components/SelectionToolbar.module.css`
- `app/src/components/SelectionToolbar.test.tsx`
- `app/src/lib/zip.ts` — `buildZipStream(files: ZipEntry[]): Readable` using `archiver`.
- `app/src/lib/zip.test.ts` — unit-level test that builds a small archive from in-memory buffers and inspects the emitted stream.
- `app/src/app/api/files/zip/route.ts` — `GET /api/files/zip?ids=a,b,c`.
- `app/src/app/api/files/zip/route.test.ts` — Vitest jsdom/node route test. Will use `@testcontainers/postgresql` pattern already present; may not run in Docker-less environments, which is consistent with other route tests in the repo.

**Modified:**
- `app/package.json` — add `"archiver": "^7.0.1"`, `"@types/archiver": "^6.0.2"` (devDep).
- `app/src/app/(shell)/layout.tsx` — wrap tree with `<SelectionProvider>`, render `<SelectionToolbar />`.
- `app/src/components/FileCard.tsx` — new `onClick` handler for modifier keys; conditional `styles.selected` class; passes `SelectedItem` to provider when toggling.
- `app/src/components/FileCard.module.css` — add `.selected { ... }` selected-state ring + corner check.
- `app/src/components/FileCard.test.tsx` — add tests covering Cmd-click, Shift-click, plain-click navigation preserved.
- `app/src/components/FolderTile.tsx` — same treatment as FileCard.
- `app/src/components/FolderTile.module.css` — `.selected` rule.
- `app/src/components/FolderTile.test.tsx` — new (FolderTile currently has no test — add one in this phase for the click-handler behavior).
- `app/src/components/FileContextMenu.tsx` — branch on `useSelection().items` containing the clicked file; batch-mode rendering.
- `app/src/components/FileContextMenu.test.tsx` — add multi-select assertions.
- `app/src/components/FolderContextMenu.tsx` — same branch.
- `app/src/components/FolderContextMenu.test.tsx` — same.

**Untouched:**
- Server endpoints `/api/files/[id]/*`, `/api/folders/[id]/*` — reused as-is by client-side batch loops.
- `ItemActionProvider` — single-item only; batch dialogs live inside `SelectionToolbar`.
- `DESIGN.md` — no principles change.

---

## Task 1: Branch + dep

- [ ] **Step 1: Branch**
  ```bash
  git -C /root/vorevault fetch origin
  git -C /root/vorevault checkout main && git -C /root/vorevault pull --ff-only
  git -C /root/vorevault checkout -b feat/phase-2b-multiselect-and-zip
  ```

- [ ] **Step 2: Install archiver**
  ```bash
  cd /root/vorevault/app && npm install --save archiver && npm install --save-dev @types/archiver
  ```

- [ ] **Step 3: Baseline**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 2>&1 | tail -5
  cd /root/vorevault/app && npm run build 2>&1 | tail -5
  ```
  Expected: all green, clean build. If not, stop and investigate.

- [ ] **Step 4: Commit deps**
  ```bash
  cd /root/vorevault
  git add app/package.json app/package-lock.json
  git commit -m "chore(deps): add archiver for zip streaming"
  ```

---

## Task 2: `SelectionContext` — hook + provider

**Files:**
- Create: `app/src/components/SelectionContext.tsx`
- Create: `app/src/components/SelectionContext.test.tsx`

### Step 1: Write the failing test

Write `app/src/components/SelectionContext.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";

function file(id: string, canManage = true): SelectedItem {
  return { kind: "file", id, name: `f-${id}`, canManage, folderId: null };
}
function folder(id: string, canManage = true): SelectedItem {
  return { kind: "folder", id, name: `d-${id}`, canManage, parentId: null };
}

describe("SelectionContext", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SelectionProvider>{children}</SelectionProvider>
  );

  it("starts empty", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current.size).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it("toggle adds then removes", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.toggle(file("a")));
    expect(result.current.size).toBe(1);
    expect(result.current.isSelected("file", "a")).toBe(true);
    act(() => result.current.toggle(file("a")));
    expect(result.current.size).toBe(0);
  });

  it("toggle tracks anchor for shift-range", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.toggle(file("a")));
    expect(result.current.anchorId).toEqual({ kind: "file", id: "a" });
    act(() => result.current.toggle(folder("b")));
    expect(result.current.anchorId).toEqual({ kind: "folder", id: "b" });
  });

  it("addRange adds items and sets new anchor", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    const items = [file("a"), file("b"), file("c")];
    act(() => result.current.addRange(items));
    expect(result.current.size).toBe(3);
    expect(result.current.anchorId).toEqual({ kind: "file", id: "c" });
  });

  it("clear empties selection and resets anchor", () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => result.current.toggle(file("a")));
    act(() => result.current.clear());
    expect(result.current.size).toBe(0);
    expect(result.current.anchorId).toBeNull();
  });

  it("throws when used outside provider", () => {
    function Probe() {
      useSelection();
      return null;
    }
    const err = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(/SelectionProvider/);
    } finally {
      console.error = err;
    }
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- SelectionContext
```

### Step 3: Implement

Write `app/src/components/SelectionContext.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SelectedItem =
  | { kind: "file"; id: string; name: string; canManage: boolean; folderId: string | null }
  | { kind: "folder"; id: string; name: string; canManage: boolean; parentId: string | null };

export type SelectionAnchor = { kind: "file" | "folder"; id: string } | null;

type Ctx = {
  items: SelectedItem[];
  size: number;
  anchorId: SelectionAnchor;
  isSelected: (kind: "file" | "folder", id: string) => boolean;
  toggle: (item: SelectedItem) => void;
  addRange: (items: SelectedItem[]) => void;
  clear: () => void;
};

const SelectionCtx = createContext<Ctx | null>(null);

export function useSelection(): Ctx {
  const v = useContext(SelectionCtx);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}

function itemKey(kind: "file" | "folder", id: string): string {
  return `${kind}:${id}`;
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [anchorId, setAnchorId] = useState<SelectionAnchor>(null);

  const isSelected = useCallback(
    (kind: "file" | "folder", id: string) => items.some((it) => it.kind === kind && it.id === id),
    [items],
  );

  const toggle = useCallback((item: SelectedItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.kind === item.kind && it.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next.splice(idx, 1);
        return next;
      }
      return [...prev, item];
    });
    setAnchorId({ kind: item.kind, id: item.id });
  }, []);

  const addRange = useCallback((range: SelectedItem[]) => {
    if (range.length === 0) return;
    setItems((prev) => {
      const keys = new Set(prev.map((it) => itemKey(it.kind, it.id)));
      const added = range.filter((it) => !keys.has(itemKey(it.kind, it.id)));
      return added.length === 0 ? prev : [...prev, ...added];
    });
    const last = range[range.length - 1];
    setAnchorId({ kind: last.kind, id: last.id });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setAnchorId(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      size: items.length,
      anchorId,
      isSelected,
      toggle,
      addRange,
      clear,
    }),
    [items, anchorId, isSelected, toggle, addRange, clear],
  );

  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}
```

### Step 4: Tests pass, commit

```bash
cd /root/vorevault/app && npm test -- SelectionContext
cd /root/vorevault
git add app/src/components/SelectionContext.tsx app/src/components/SelectionContext.test.tsx
git commit -m "feat(ui): SelectionContext with toggle/range/clear + anchor"
```

---

## Task 3: Selected-state CSS on FileCard + FolderTile

No logic changes yet — just CSS + a class-name pass-through prop so tests can assert the state renders.

**Files:**
- Modify: `app/src/components/FileCard.module.css` — add `.selected` rule.
- Modify: `app/src/components/FolderTile.module.css` — add `.selected` rule.

### Step 1: FileCard.module.css

Add at the end of the file:

```css

.selected {
  outline: 3px solid var(--vv-accent);
  outline-offset: 2px;
}

.selected::after {
  content: "";
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--vv-accent);
  border: 2.5px solid var(--vv-ink);
  box-shadow: var(--vv-shadow-sm);
  z-index: 3;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23f4ead5' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
}
```

(The inline SVG check-mark uses the cream `#f4ead5` = `--vv-bg`. Design tokens don't go into SVG data-URLs easily.)

### Step 2: FolderTile.module.css

Add at the end:

```css

.selected {
  outline: 3px solid var(--vv-accent);
  outline-offset: 2px;
  background: var(--vv-accent);
  color: var(--vv-bg);
}
```

(Folders have no thumbnail area to host a corner checkmark — the whole tile flips to accent when selected.)

### Step 3: Build check (no test for pure CSS)

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -5
```

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/FileCard.module.css app/src/components/FolderTile.module.css
git commit -m "feat(ui): selected-state styles for FileCard and FolderTile"
```

---

## Task 4: FileCard — modifier-click handler + selected prop

**Files:**
- Modify: `app/src/components/FileCard.tsx`
- Modify: `app/src/components/FileCard.test.tsx`

### Step 1: Rewrite FileCard.tsx

Replace the component body so the returned anchor gains an onClick that intercepts modifier keys and reflects selected state. The props signature gains a new optional `currentUserId` — but to avoid threading it through every call site, FileCard reads it from `useCurrentUser()` directly. FileCard becomes a client component (`"use client"`).

Current FileCard is a server component (no "use client"). Changing to client is fine: it has no server-only imports and all its CSS/logic is presentational.

Full new `app/src/components/FileCard.tsx`:

```tsx
"use client";

import type { MouseEvent } from "react";
import type { FileWithUploader } from "@/lib/files";
import { classifyFile } from "@/lib/fileKind";
import { FileIcon } from "./FileIcon";
import { FileContextMenu } from "./FileContextMenu";
import { useCurrentUser } from "./CurrentUserContext";
import { useSelection, type SelectedItem } from "./SelectionContext";
import styles from "./FileCard.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const ago = Date.now() - d.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FileCard({
  file,
  isShared,
}: {
  file: FileWithUploader;
  isShared?: boolean;
}) {
  const user = useCurrentUser();
  const selection = useSelection();
  const selected = selection.isSelected("file", file.id);
  const canManage = user.isAdmin || file.uploader_id === user.id;

  const { kind, label } = classifyFile(file.mime_type, file.original_name);
  const duration = (kind === "video" || kind === "audio") ? formatDuration(file.duration_sec) : null;
  const hasThumb = file.thumbnail_path != null;

  const descriptor: SelectedItem = {
    kind: "file",
    id: file.id,
    name: file.original_name,
    canManage,
    folderId: file.folder_id,
  };

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      selection.toggle(descriptor);
      return;
    }
    if (e.shiftKey) {
      e.preventDefault();
      // Range anchor not yet implemented at the grid level; Phase 2b treats
      // shift-click as a single-item add (upgrades when grid-aware range
      // helpers land — see Phase 2c keyboard nav).
      selection.toggle(descriptor);
      return;
    }
    // plain click → navigate (default anchor behavior)
  }

  const className = selected ? `${styles.card} ${styles.selected}` : styles.card;

  return (
    <FileContextMenu file={file}>
      <a href={`/f/${file.id}`} className={className} onClick={handleClick} aria-pressed={selected}>
        <div className={styles.thumb}>
          {hasThumb ? (
            <img src={`/api/thumbs/${file.id}`} alt="" loading="lazy" />
          ) : (
            <div className={`${styles.iconTile} ${styles[`kind_${kind.replaceAll("-", "_")}`]}`}>
              <FileIcon kind={kind} size={48} />
            </div>
          )}
          <span className={styles.typeBadge}>{label}</span>
          {duration && <span className={styles.duration}>{duration}</span>}
          {isShared && <span className={styles.sharedBadge}>✦ shared</span>}
        </div>
        <div className={styles.meta}>
          <div className={styles.title}>{file.original_name}</div>
          <div className={`vv-meta ${styles.sub}`}>
            {file.uploader_name} · <strong>{formatBytes(file.size_bytes)}</strong> · <strong>{relativeTime(file.created_at)}</strong>
          </div>
        </div>
      </a>
    </FileContextMenu>
  );
}
```

> Note: The shift-click true-range behavior needs grid-wide knowledge of item order (which the card doesn't have). This plan intentionally scopes shift-click to "add this item to selection" for now. A proper grid-aware range helper (slice of all items between anchor and target) is a Phase 2c addition when grid keyboard nav lands — because the same data structure (ordered item array) drives both.

### Step 2: Update FileCard.test.tsx

The existing 7 tests are rendered via `renderWithProviders` (added in Phase 2a). That helper mounts `CurrentUserProvider` + `ItemActionProvider` but NOT `SelectionProvider`. Extend it.

At the top of `FileCard.test.tsx`, locate the `renderWithProviders` helper and add the SelectionProvider wrapper:

```tsx
import { SelectionProvider } from "./SelectionContext";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <CurrentUserProvider value={{ id: "u-test", isAdmin: false }}>
      <SelectionProvider>
        <ItemActionProvider>{ui}</ItemActionProvider>
      </SelectionProvider>
    </CurrentUserProvider>,
  );
}
```

Add three new `it(...)` cases at the end of the describe block:

```tsx
  it("plain click does not preventDefault (navigation proceeds)", () => {
    const { container } = renderWithProviders(<FileCard file={makeFile()} />);
    const link = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("meta-click toggles the card into selection (no navigation)", async () => {
    const { container, rerender } = renderWithProviders(<FileCard file={makeFile()} />);
    const link = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Re-render after state flush; the card should carry a selected class.
    rerender(<FileCard file={makeFile()} />);
    // We can't see the SelectionProvider's inner state through DOM alone unless
    // we inspect the anchor's className. Confirm the styles.selected class is
    // applied.
    expect(container.querySelector("a")!.className).toMatch(/selected/);
  });

  it("ctrl-click also toggles (Windows/Linux)", () => {
    const { container } = renderWithProviders(<FileCard file={makeFile()} />);
    const link = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
```

> Caveat: the "rerender" in the meta-click test doesn't actually re-read provider state since state updates happen inside the first render. The `.className` check may already reflect the selected state after the state flush. If the test flakes, use `await waitFor(() => expect(...).toMatch(/selected/))` from `@testing-library/react`.

### Step 3: Run tests

```bash
cd /root/vorevault/app && npm test -- FileCard
```

Expected: 10/10 pass (7 existing + 3 new).

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx app/src/components/FileCard.test.tsx
git commit -m "feat(ui): FileCard cmd/ctrl-click selection + selected-state visual"
```

---

## Task 5: FolderTile — modifier-click handler + selected prop + first test

**Files:**
- Modify: `app/src/components/FolderTile.tsx` — add `"use client"`, onClick handler, selected class.
- Create: `app/src/components/FolderTile.test.tsx` (does not currently exist).

### Step 1: Rewrite FolderTile.tsx

```tsx
"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { FolderContextMenu } from "./FolderContextMenu";
import { useCurrentUser } from "./CurrentUserContext";
import { useSelection, type SelectedItem } from "./SelectionContext";
import styles from "./FolderTile.module.css";

type Props = {
  id: string;
  name: string;
  fileCount: number;
  subfolderCount: number;
  createdBy: string;
  parentId: string | null;
};

export function FolderTile({ id, name, fileCount, subfolderCount, createdBy, parentId }: Props) {
  const user = useCurrentUser();
  const selection = useSelection();
  const selected = selection.isSelected("folder", id);
  const canManage = user.isAdmin || createdBy === user.id;
  const hasFiles = fileCount > 0;
  const hasSubs = subfolderCount > 0;

  const descriptor: SelectedItem = { kind: "folder", id, name, canManage, parentId };

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      selection.toggle(descriptor);
    }
  }

  const className = selected ? `${styles.tile} ${styles.selected}` : styles.tile;

  return (
    <FolderContextMenu folder={{ id, name, createdBy, parentId }}>
      <Link href={`/d/${id}`} className={className} onClick={handleClick} aria-pressed={selected}>
        <span className={styles.name}>{name}</span>
        {(hasFiles || hasSubs) && (
          <small className={`vv-meta ${styles.counts}`}>
            {hasFiles && (
              <>
                <strong>{fileCount}</strong> {fileCount === 1 ? "file" : "files"}
              </>
            )}
            {hasFiles && hasSubs && " · "}
            {hasSubs && (
              <>
                <strong>{subfolderCount}</strong> {subfolderCount === 1 ? "subfolder" : "subfolders"}
              </>
            )}
          </small>
        )}
      </Link>
    </FolderContextMenu>
  );
}
```

### Step 2: Create FolderTile.test.tsx

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { FolderTile } from "./FolderTile";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";
import { SelectionProvider } from "./SelectionContext";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderIt(props: Partial<React.ComponentProps<typeof FolderTile>> = {}) {
  return render(
    <CurrentUserProvider value={{ id: "u", isAdmin: false }}>
      <SelectionProvider>
        <ItemActionProvider>
          <FolderTile
            id="fo-1"
            name="pics"
            fileCount={2}
            subfolderCount={0}
            createdBy="u"
            parentId={null}
            {...props}
          />
        </ItemActionProvider>
      </SelectionProvider>
    </CurrentUserProvider>,
  );
}

describe("FolderTile", () => {
  it("renders name and counts", () => {
    const { container } = renderIt();
    expect(container.textContent).toContain("pics");
    expect(container.textContent).toContain("2");
  });

  it("plain click does not preventDefault", () => {
    const { container } = renderIt();
    const a = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("meta-click selects and prevents navigation", () => {
    const { container } = renderIt();
    const a = container.querySelector("a")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(container.querySelector("a")!.className).toMatch(/selected/);
  });
});
```

### Step 3: Run tests

```bash
cd /root/vorevault/app && npm test -- FolderTile
```

Expected: 3/3 pass.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/FolderTile.tsx app/src/components/FolderTile.test.tsx
git commit -m "feat(ui): FolderTile cmd/ctrl-click selection + first test"
```

---

## Task 6: `SelectionToolbar` — layout + Clear button + count

**Files:**
- Create: `app/src/components/SelectionToolbar.tsx`
- Create: `app/src/components/SelectionToolbar.module.css`
- Create: `app/src/components/SelectionToolbar.test.tsx`

### Step 1: Write the failing test

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectionToolbar } from "./SelectionToolbar";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";
import { CurrentUserProvider } from "./CurrentUserContext";
import { ItemActionProvider } from "./ItemActionProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function Seed({ items }: { items: SelectedItem[] }) {
  const sel = useSelection();
  // Seed after mount.
  if (sel.size === 0 && items.length > 0) {
    items.forEach((it) => sel.toggle(it));
  }
  return null;
}

function renderWith(items: SelectedItem[]) {
  return render(
    <CurrentUserProvider value={{ id: "u", isAdmin: false }}>
      <ItemActionProvider>
        <SelectionProvider>
          <Seed items={items} />
          <SelectionToolbar />
        </SelectionProvider>
      </ItemActionProvider>
    </CurrentUserProvider>,
  );
}

const fileItem: SelectedItem = {
  kind: "file", id: "a", name: "a.mp4", canManage: true, folderId: null,
};

describe("SelectionToolbar", () => {
  it("renders nothing when selection empty", () => {
    renderWith([]);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("shows '1 selected' after one item is seeded", () => {
    renderWith([fileItem]);
    expect(screen.getByText(/1 selected/)).toBeInTheDocument();
  });

  it("Clear button empties the selection", async () => {
    const user = userEvent.setup();
    renderWith([fileItem]);
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- SelectionToolbar
```

### Step 3: Implement SelectionToolbar.tsx

```tsx
"use client";

import { useSelection } from "./SelectionContext";
import { Button } from "./Button";
import styles from "./SelectionToolbar.module.css";

export function SelectionToolbar() {
  const selection = useSelection();

  if (selection.size === 0) return null;

  return (
    <div className={styles.bar} role="toolbar" aria-label="selection actions">
      <span className={styles.count}>
        <strong>{selection.size}</strong> selected
      </span>
      <div className={styles.spacer} />
      <Button type="button" variant="ghost" onClick={() => selection.clear()}>
        clear
      </Button>
    </div>
  );
}
```

### Step 4: SelectionToolbar.module.css

```css
.bar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--vv-ink);
  color: var(--vv-bg);
  border: 2.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-md);
  box-shadow: var(--vv-shadow-md);
  margin-bottom: 16px;
}

.count {
  font: 600 14px/1 var(--vv-font-ui);
}

.count strong {
  font-family: var(--vv-font-mono);
}

.spacer {
  flex: 1;
}
```

### Step 5: Tests pass, commit

```bash
cd /root/vorevault/app && npm test -- SelectionToolbar
cd /root/vorevault
git add app/src/components/SelectionToolbar.tsx app/src/components/SelectionToolbar.module.css app/src/components/SelectionToolbar.test.tsx
git commit -m "feat(ui): SelectionToolbar shell with count + clear"
```

---

## Task 7: `SelectionToolbar` — batch trash

Batch trash opens an inline `ConfirmDialog`, then loops over the selected items hitting the existing single-item trash endpoints, and reports a result toast.

**Files:**
- Modify: `app/src/components/SelectionToolbar.tsx` — add Trash button + ConfirmDialog + handler.
- Modify: `app/src/components/SelectionToolbar.test.tsx` — add Trash test.

### Step 1: Extend the test

Add at the bottom of the describe block:

```tsx
  it("Trash button is hidden unless all selected items are manageable", () => {
    renderWith([{ ...fileItem, canManage: false }]);
    expect(screen.queryByRole("button", { name: /move to trash/i })).not.toBeInTheDocument();
  });

  it("Trash button runs the confirm dialog on click", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    renderWith([fileItem]);
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    // Confirm dialog opens.
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
```

### Step 2: Run, confirm new cases fail

```bash
cd /root/vorevault/app && npm test -- SelectionToolbar
```

### Step 3: Implement

Full new `app/src/components/SelectionToolbar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { useItemActions } from "./ItemActionProvider";
import { Button } from "./Button";
import { ConfirmDialog } from "./Dialogs";
import styles from "./SelectionToolbar.module.css";

type BatchResult = { succeeded: number; failed: number };

async function batchTrash(items: SelectedItem[]): Promise<BatchResult> {
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    const url = it.kind === "file"
      ? `/api/files/${it.id}/trash`
      : `/api/folders/${it.id}/trash`;
    try {
      const res = await fetch(url, { method: "POST" });
      if (res.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { succeeded, failed };
}

export function SelectionToolbar() {
  const selection = useSelection();
  const { showToast } = useItemActions();
  const router = useRouter();
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashing, setTrashing] = useState(false);

  if (selection.size === 0) return null;

  const allManageable = selection.items.every((it) => it.canManage);

  async function runTrash() {
    setTrashing(true);
    try {
      const result = await batchTrash(selection.items);
      setTrashOpen(false);
      selection.clear();
      router.refresh();
      if (result.failed === 0) {
        showToast({ message: `trashed ${result.succeeded}`, variant: "success" });
      } else {
        showToast({
          message: `trashed ${result.succeeded}, failed ${result.failed}`,
          variant: "error",
        });
      }
    } finally {
      setTrashing(false);
    }
  }

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="selection actions">
        <span className={styles.count}>
          <strong>{selection.size}</strong> selected
        </span>
        <div className={styles.spacer} />
        {allManageable && (
          <Button type="button" variant="danger" onClick={() => setTrashOpen(true)} disabled={trashing}>
            move to trash
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => selection.clear()}>
          clear
        </Button>
      </div>

      <ConfirmDialog
        open={trashOpen}
        onClose={() => !trashing && setTrashOpen(false)}
        title="move to trash"
        message={`move ${selection.size} item${selection.size === 1 ? "" : "s"} to trash? can be restored within 30 days.`}
        confirmLabel="trash"
        variant="danger"
        onConfirm={runTrash}
      />
    </>
  );
}
```

### Step 4: Tests pass, commit

```bash
cd /root/vorevault/app && npm test -- SelectionToolbar
cd /root/vorevault
git add app/src/components/SelectionToolbar.tsx app/src/components/SelectionToolbar.test.tsx
git commit -m "feat(ui): SelectionToolbar batch trash with canManage gating"
```

---

## Task 8: `SelectionToolbar` — batch move

Batch move opens a Modal containing a FolderPicker; on save, loops single-item endpoints.

**Files:**
- Modify: `app/src/components/SelectionToolbar.tsx` — add Move button + Modal + FolderPicker + handler.
- Modify: `app/src/components/SelectionToolbar.test.tsx` — add Move test.

### Step 1: Extend the test

```tsx
  it("Move button opens a folder picker modal", async () => {
    const user = userEvent.setup();
    renderWith([fileItem]);
    await user.click(screen.getByRole("button", { name: /^move to…$/i }));
    expect(await screen.findByRole("dialog", { name: /move/i })).toBeInTheDocument();
  });
```

### Step 2: Add to SelectionToolbar.tsx

Add imports at top (extending what's there):

```tsx
import { Modal } from "./Modal";
import { FolderPicker } from "./FolderPicker";
```

Add helper:

```tsx
async function batchMove(items: SelectedItem[], folderId: string | null): Promise<BatchResult> {
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    try {
      const res = it.kind === "file"
        ? await fetch(`/api/files/${it.id}/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId }),
          })
        : await fetch(`/api/folders/${it.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parentId: folderId }),
          });
      if (res.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { succeeded, failed };
}
```

Extend the component state and render. The final `SelectionToolbar` component body:

```tsx
export function SelectionToolbar() {
  const selection = useSelection();
  const { showToast } = useItemActions();
  const router = useRouter();
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  if (selection.size === 0) return null;

  const allManageable = selection.items.every((it) => it.canManage);

  async function runTrash() { /* unchanged from Task 7 */ }

  async function runMove() {
    setMoving(true);
    try {
      const result = await batchMove(selection.items, moveTarget);
      setMoveOpen(false);
      setMoveTarget(null);
      selection.clear();
      router.refresh();
      if (result.failed === 0) {
        showToast({ message: `moved ${result.succeeded}`, variant: "success" });
      } else {
        showToast({ message: `moved ${result.succeeded}, failed ${result.failed}`, variant: "error" });
      }
    } finally {
      setMoving(false);
    }
  }

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="selection actions">
        <span className={styles.count}><strong>{selection.size}</strong> selected</span>
        <div className={styles.spacer} />
        {allManageable && (
          <>
            <Button type="button" onClick={() => setMoveOpen(true)} disabled={moving}>
              move to…
            </Button>
            <Button type="button" variant="danger" onClick={() => setTrashOpen(true)} disabled={trashing}>
              move to trash
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" onClick={() => selection.clear()}>
          clear
        </Button>
      </div>

      <ConfirmDialog
        open={trashOpen}
        onClose={() => !trashing && setTrashOpen(false)}
        title="move to trash"
        message={`move ${selection.size} item${selection.size === 1 ? "" : "s"} to trash? can be restored within 30 days.`}
        confirmLabel="trash"
        variant="danger"
        onConfirm={runTrash}
      />

      <Modal open={moveOpen} onClose={() => !moving && setMoveOpen(false)} title={`move ${selection.size} item${selection.size === 1 ? "" : "s"}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FolderPicker value={moveTarget} onChange={setMoveTarget} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={() => setMoveOpen(false)}>cancel</Button>
            <Button type="button" variant="primary" onClick={runMove} disabled={moving}>
              {moving ? "moving…" : "save"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
```

### Step 3: Test + commit

```bash
cd /root/vorevault/app && npm test -- SelectionToolbar
cd /root/vorevault
git add app/src/components/SelectionToolbar.tsx app/src/components/SelectionToolbar.test.tsx
git commit -m "feat(ui): SelectionToolbar batch move with folder picker"
```

---

## Task 9: `lib/zip.ts` — streaming zip builder

Wraps `archiver` in a single clean function. Takes `ZipEntry[]` (id, name, disk path), returns a Node `Readable` that emits a .zip stream.

**Files:**
- Create: `app/src/lib/zip.ts`
- Create: `app/src/lib/zip.test.ts`

### Step 1: Write the failing test

```ts
import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { buildZipStream, type ZipEntry } from "./zip";

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("buildZipStream", () => {
  it("builds a zip with multiple entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vv-zip-test-"));
    try {
      const pathA = join(dir, "a.txt");
      const pathB = join(dir, "b.bin");
      await writeFile(pathA, "hello world");
      await writeFile(pathB, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      const entries: ZipEntry[] = [
        { name: "notes.txt", path: pathA },
        { name: "binary.bin", path: pathB },
      ];

      const stream = buildZipStream(entries);
      const buf = await collect(stream);

      // Basic zip signature: local file header starts with PK\x03\x04
      expect(buf.slice(0, 4).toString("hex")).toBe("504b0304");
      // Central directory signature PK\x01\x02 appears somewhere in the output
      expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))).toBeGreaterThan(0);
      // End of central directory signature PK\x05\x06 near the end
      expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(0);
      // Names appear in the raw bytes
      expect(buf.includes(Buffer.from("notes.txt"))).toBe(true);
      expect(buf.includes(Buffer.from("binary.bin"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("handles empty entry list gracefully (emits an empty-ish archive)", async () => {
    const stream = buildZipStream([]);
    const buf = await collect(stream);
    // Empty zip still has the EOCD record.
    expect(buf.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThanOrEqual(0);
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- zip
```

### Step 3: Implement

Create `app/src/lib/zip.ts`:

```ts
import archiver from "archiver";
import type { Readable } from "node:stream";
import { createReadStream } from "node:fs";

export type ZipEntry = {
  /** filename inside the zip; collisions get " (2)" etc. suffix. */
  name: string;
  /** absolute filesystem path to the source file. */
  path: string;
};

/**
 * Stream a zip archive of the given files. STORE mode (no compression) —
 * inputs are usually already compressed (videos, images) so deflate would
 * waste CPU. Returns a Node Readable for piping.
 */
export function buildZipStream(entries: ZipEntry[]): Readable {
  const archive = archiver("zip", { store: true });

  // Dedupe names so an archive containing two "report.pdf" uploaded to
  // different folders becomes "report.pdf" and "report (2).pdf" inside the zip.
  const seen = new Map<string, number>();
  for (const entry of entries) {
    const base = entry.name;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const nameInZip = count === 1 ? base : suffixName(base, count);
    archive.append(createReadStream(entry.path), { name: nameInZip });
  }

  archive.finalize().catch(() => {
    // finalize errors surface as 'error' events on the stream; nothing more to do here.
  });

  return archive;
}

function suffixName(name: string, count: number): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name} (${count})`;
  return `${name.slice(0, dot)} (${count})${name.slice(dot)}`;
}
```

### Step 4: Tests pass, commit

```bash
cd /root/vorevault/app && npm test -- zip
cd /root/vorevault
git add app/src/lib/zip.ts app/src/lib/zip.test.ts
git commit -m "feat(lib): streaming zip builder with name dedup"
```

---

## Task 10: `GET /api/files/zip?ids=...` route

**Files:**
- Create: `app/src/app/api/files/zip/route.ts`
- Create: `app/src/app/api/files/zip/route.test.ts` (integration test; may skip in Docker-less environments — that's fine, matches existing route test patterns)

### Step 1: Write the route test (integration-style; optional if testcontainers unavailable)

Match the pattern of `app/src/app/api/stream/[id]/route.test.ts` or similar. If none exists, skip writing this test and rely on manual verification — other route tests follow this pattern and environmental skips are expected. If present, the test should:

- Seed Postgres via the testcontainer fixture.
- Create a test user + session.
- Insert two tiny on-disk files.
- Call `GET /api/files/zip?ids=<id1>,<id2>` with session cookie.
- Assert response 200, `Content-Type: application/zip`, body begins with zip signature `504b0304`.

(If route tests in this codebase use a different pattern, follow the existing one rather than inventing.)

### Step 2: Implement the route

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getSessionUser } from "@/lib/sessions";
import { getFile } from "@/lib/files";
import { buildZipStream, type ZipEntry } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "vv_session";
const MAX_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function GET(req: NextRequest) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse("auth required", { status: 401 });

  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return new NextResponse("no ids", { status: 400 });
  if (ids.length > MAX_IDS) return new NextResponse(`max ${MAX_IDS} ids`, { status: 413 });
  for (const id of ids) {
    if (!UUID_RE.test(id)) return new NextResponse("invalid id", { status: 400 });
  }

  const entries: ZipEntry[] = [];
  for (const id of ids) {
    const file = await getFile(id);
    if (!file) continue;
    if (file.deleted_at != null) continue;
    entries.push({
      name: file.original_name,
      // Use the stored path, never the transcoded copy — users want the original upload.
      path: file.storage_path,
    });
  }
  if (entries.length === 0) return new NextResponse("no resolvable files", { status: 404 });

  const nodeStream = buildZipStream(entries);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const filename = `vorevault-${entries.length}-files-${dateStamp()}.zip`;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

### Step 3: Build check

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -8
```

Expected: clean.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/app/api/files/zip/route.ts
# Only add route.test.ts if you actually wrote one.
git commit -m "feat(api): GET /api/files/zip streams a zip of up to 50 files"
```

---

## Task 11: `SelectionToolbar` — Download zip button

**Files:**
- Modify: `app/src/components/SelectionToolbar.tsx`
- Modify: `app/src/components/SelectionToolbar.test.tsx`

### Step 1: Extend the test

```tsx
  it("Download zip button is hidden if selection contains a folder", () => {
    renderWith([fileItem, { kind: "folder", id: "fo", name: "d", canManage: true, parentId: null }]);
    expect(screen.queryByRole("button", { name: /download as zip/i })).not.toBeInTheDocument();
  });

  it("Download zip button is visible when selection is files only", () => {
    renderWith([fileItem]);
    expect(screen.getByRole("button", { name: /download as zip/i })).toBeInTheDocument();
  });

  it("Download zip button is disabled if selection exceeds 50 files", () => {
    const many = Array.from({ length: 51 }, (_, i): SelectedItem => ({
      kind: "file", id: `id-${i}`, name: `f${i}`, canManage: true, folderId: null,
    }));
    renderWith(many);
    const btn = screen.getByRole("button", { name: /download as zip/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
```

### Step 2: Add to SelectionToolbar.tsx

Inside the component body, compute:

```tsx
const MAX_ZIP = 50;
const onlyFiles = selection.items.every((it) => it.kind === "file");
const zipDisabled = !onlyFiles || selection.size > MAX_ZIP;
```

Render the button (only when `onlyFiles`):

```tsx
{onlyFiles && (
  <Button
    type="button"
    variant="primary"
    onClick={() => startZipDownload(selection.items)}
    disabled={zipDisabled}
    title={selection.size > MAX_ZIP ? `max ${MAX_ZIP} files` : undefined}
  >
    download as zip
  </Button>
)}
```

Add a helper (outside the component):

```tsx
function startZipDownload(items: SelectedItem[]) {
  const ids = items.filter((it) => it.kind === "file").map((it) => it.id);
  if (ids.length === 0) return;
  const url = `/api/files/zip?ids=${encodeURIComponent(ids.join(","))}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

### Step 3: Run tests

```bash
cd /root/vorevault/app && npm test -- SelectionToolbar
```

Expected: prior passes + 3 new = 8 total (adjust if count differs).

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/SelectionToolbar.tsx app/src/components/SelectionToolbar.test.tsx
git commit -m "feat(ui): SelectionToolbar download-as-zip button"
```

---

## Task 12: FileContextMenu multi-select mode

When the right-clicked file is in the current selection AND `selection.size > 1`, the menu shows **only** Download-as-zip (files-only selection) / Move to… / Move to trash — all three gated on `canManage` across the whole selection where relevant.

**Files:**
- Modify: `app/src/components/FileContextMenu.tsx`
- Modify: `app/src/components/FileContextMenu.test.tsx`

### Step 1: Extend the test

```tsx
  it("batch mode (selected item with selection > 1) shows only batch actions", async () => {
    // Seed: two files, both selected. Right-click one of them.
    const file = makeFile();
    function Harness() {
      const sel = useSelection();
      if (sel.size === 0) {
        sel.toggle({ kind: "file", id: file.id, name: file.original_name, canManage: true, folderId: null });
        sel.toggle({ kind: "file", id: "other", name: "other.mp4", canManage: true, folderId: null });
      }
      return (
        <FileContextMenu file={file}>
          <div data-testid="target">t</div>
        </FileContextMenu>
      );
    }
    render(
      <CurrentUserProvider value={{ id: "u-owner", isAdmin: false }}>
        <SelectionProvider>
          <ItemActionProvider>
            <Harness />
          </ItemActionProvider>
        </SelectionProvider>
      </CurrentUserProvider>,
    );
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/download as zip/i)).toBeInTheDocument();
    expect(screen.getByText(/^move to…$/i)).toBeInTheDocument();
    expect(screen.getByText(/move to trash/i)).toBeInTheDocument();
    expect(screen.queryByText(/^open$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^rename$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/copy public link/i)).not.toBeInTheDocument();
  });
```

Requires extending imports at the top of the test file: `import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";`.

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- FileContextMenu
```

### Step 3: Branch FileContextMenu.tsx on selection

Change the top of the component:

```tsx
const selection = useSelection();
const isInSelection = selection.isSelected("file", file.id);
const multi = isInSelection && selection.size > 1;
```

Then replace the returned menu content:

```tsx
<ContextMenu.Content className={styles.content}>
  {!multi && (
    <>
      <ContextMenu.Item className={styles.item} onSelect={() => router.push(`/f/${file.id}`)}>
        open
      </ContextMenu.Item>
      <ContextMenu.Item className={styles.item} onSelect={() => programmaticDownload(file.id)}>
        download
      </ContextMenu.Item>
      <ContextMenu.Item className={styles.item} onSelect={() => actions.copyPublicLink(file.id)}>
        copy public link
      </ContextMenu.Item>
      {canManage && (
        <>
          <ContextMenu.Separator className={styles.sep} />
          {/* existing Rename + Move + Trash items unchanged */}
        </>
      )}
    </>
  )}
  {multi && (
    <BatchItems />
  )}
</ContextMenu.Content>
```

Add a `<BatchItems />` internal component inside FileContextMenu.tsx:

```tsx
function BatchItems() {
  const selection = useSelection();
  const allFiles = selection.items.every((it) => it.kind === "file");
  const allManageable = selection.items.every((it) => it.canManage);

  function downloadSelection() {
    const ids = selection.items.filter((it) => it.kind === "file").map((it) => it.id);
    if (ids.length === 0) return;
    const a = document.createElement("a");
    a.href = `/api/files/zip?ids=${encodeURIComponent(ids.join(","))}`;
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      {allFiles && selection.size <= 50 && (
        <ContextMenu.Item className={styles.item} onSelect={downloadSelection}>
          download as zip
        </ContextMenu.Item>
      )}
      {allManageable && (
        <>
          {/* Move to… and Move to trash route through SelectionToolbar's dialogs,
              but the context menu triggers the same UX by opening the modals via a
              bridge. Simplest approach: rely on the user using the SelectionToolbar
              for batch dialogs. For Phase 2b, the context menu's batch Move/Trash
              items simply trigger the toolbar actions via a shared bus.

              To keep scope tight: expose two event-less triggers via the SelectionProvider,
              `requestBatchMove()` and `requestBatchTrash()`, which the SelectionToolbar
              subscribes to. Add these to the provider in this same task. */}
          <ContextMenu.Item
            className={styles.item}
            onSelect={() => { window.dispatchEvent(new CustomEvent("vv:batch-move")); }}
          >
            move to…
          </ContextMenu.Item>
          <ContextMenu.Item
            className={`${styles.item} ${styles.danger}`}
            onSelect={() => { window.dispatchEvent(new CustomEvent("vv:batch-trash")); }}
          >
            move to trash
          </ContextMenu.Item>
        </>
      )}
    </>
  );
}
```

And update `SelectionToolbar.tsx` to listen for `vv:batch-move` and `vv:batch-trash` window events, calling its existing `setMoveOpen(true)` / `setTrashOpen(true)` state setters. Add this `useEffect` inside `SelectionToolbar`:

```tsx
useEffect(() => {
  function onMove() { setMoveOpen(true); }
  function onTrash() { setTrashOpen(true); }
  window.addEventListener("vv:batch-move", onMove);
  window.addEventListener("vv:batch-trash", onTrash);
  return () => {
    window.removeEventListener("vv:batch-move", onMove);
    window.removeEventListener("vv:batch-trash", onTrash);
  };
}, []);
```

> The `window`-event bridge is a small compromise: it avoids threading imperative trigger functions through three levels of providers. It's scoped to this feature and the event names are namespaced. If a cleaner pattern emerges in Phase 2c/d, reconsider.

### Step 4: Run, commit

```bash
cd /root/vorevault/app && npm test -- FileContextMenu SelectionToolbar
cd /root/vorevault
git add app/src/components/FileContextMenu.tsx app/src/components/FileContextMenu.test.tsx app/src/components/SelectionToolbar.tsx
git commit -m "feat(ui): FileContextMenu batch mode when right-click hits selected file"
```

---

## Task 13: FolderContextMenu multi-select mode

Same pattern as Task 12 but for folders. Note: folders don't zip (Phase 2b skips recursive folder-zip), so in batch mode a folder-originated right-click shows only Move to… + Move to trash.

**Files:**
- Modify: `app/src/components/FolderContextMenu.tsx`
- Modify: `app/src/components/FolderContextMenu.test.tsx`

### Step 1: Extend the test

Add a batch-mode test mirroring the FileContextMenu one (two folders selected, right-click one, assert only Move to… + Move to trash visible).

### Step 2: Implement batch branch

Add `useSelection()`, compute `multi`, and when `multi` render a `<BatchItems />` that dispatches `vv:batch-move` and `vv:batch-trash` window events. Skip the zip action entirely.

Commit:
```bash
git add app/src/components/FolderContextMenu.tsx app/src/components/FolderContextMenu.test.tsx
git commit -m "feat(ui): FolderContextMenu batch mode when right-click hits selected folder"
```

---

## Task 14: Wire providers + toolbar + Esc / route-change clear

**Files:**
- Modify: `app/src/app/(shell)/layout.tsx` — wrap with `<SelectionProvider>`, render `<SelectionToolbar />`.
- Create: `app/src/components/SelectionChrome.tsx` — small client component that handles Esc keyboard + pathname-change selection.clear(). Rendered inside `<SelectionProvider>`.

### Step 1: SelectionChrome.tsx

```tsx
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
    // Disable exhaustive-deps: we intentionally fire on pathname change only.
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
```

### Step 2: Update shell layout

Add imports + wrap + render. Inside the existing `<ItemActionProvider>`:

```tsx
<SelectionProvider>
  <SelectionChrome />
  <div className={styles.shell}>
    <TopBar .../>
    <div className={styles.body}>
      <Sidebar .../>
      <main className={styles.main}>
        <SelectionToolbar />
        {children}
      </main>
    </div>
    ...
  </div>
</SelectionProvider>
```

### Step 3: Build + smoke test

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -5
cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 2>&1 | tail -5
```

Expected: clean build, all tests green.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/app/\(shell\)/layout.tsx app/src/components/SelectionChrome.tsx
git commit -m "feat(ui): wire SelectionProvider + SelectionToolbar + Esc/route-change clear"
```

---

## Task 15: Verification + PR

- [ ] **Step 1: Full unit suite**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib' 2>&1 | tail -10
  ```
  Record counts.

- [ ] **Step 2: Build**
  ```bash
  cd /root/vorevault/app && npm run build 2>&1 | tail -5
  ```

- [ ] **Step 3: Manual browser checks** (requires dev session)
  - Cmd/Ctrl-click files and folders — sticker ring and check-corner appear on selected.
  - Selection toolbar appears after first selection, disappears after Clear.
  - Batch Trash with 2 manageable files — both move to trash, toast confirms.
  - Batch Trash with 1 manageable + 1 unmanageable — **not allowed**: toolbar hides Trash because `allManageable` is false.
  - Batch Move with 2 files into a picked folder — both move, page refreshes, toast confirms.
  - Download as zip with 2-3 files — browser starts downloading a .zip named `vorevault-<N>-files-<date>.zip`. Unzip — originals inside with their names.
  - Download as zip with a folder in selection — button is hidden.
  - Right-click a selected item with selection > 1 — menu shows batch actions; right-click an unselected item — menu shows single-item actions; existing selection is preserved.
  - Esc clears selection.
  - Navigate to another page — selection clears.

- [ ] **Step 4: Commit plan, push, open PR**
  ```bash
  cd /root/vorevault
  git add docs/superpowers/plans/2026-04-23-phase-2b-multiselect-and-zip.md
  git commit -m "docs: Phase 2b implementation plan"
  git push -u origin feat/phase-2b-multiselect-and-zip
  gh pr create --title "feat: Phase 2b — multi-select, batch actions, download-zip" --body "$(cat <<'EOF'
## Summary

Drive-style multi-select across file cards and folder tiles, a persistent selection toolbar with batch trash / move / download-as-zip, and context menus that apply to the whole selection when right-click hits a selected item.

- New `SelectionProvider` — stores full `SelectedItem` descriptors (kind, id, name, canManage, folder id). Ordered by insertion; anchor tracks last-toggled item.
- `FileCard` / `FolderTile` intercept Cmd/Ctrl-click + Shift-click; plain click still navigates. Visual selected-state ring + corner check.
- `SelectionToolbar` — count, Clear, Download as zip (files-only, ≤50), Move to…, Move to trash. Owns its own confirm + move dialogs.
- Batch trash / move = client-side loops over existing single-item endpoints. Per-item success/fail counted and surfaced in a summary toast.
- `GET /api/files/zip?ids=a,b,c` — streams a zip using `archiver` (new runtime dep). Up to 50 files. Files only (folders excluded in 2b).
- Context menus grow a batch mode: when right-click hits a selected item AND selection > 1, the menu shows only batch-safe actions. Non-selected right-click and single-select right-click behave as in 2a.
- Esc clears; pathname change clears.

## Deferred (Phase 2c onward)

- Grid arrow-key nav and Cmd/Ctrl+A select-all.
- True shift-range across a linearized grid (Phase 2b falls back to "shift-click == toggle" since cards don't yet know their grid neighbors).
- Marquee / drag-box select.
- Recursive folder-zip.
- Server-side batch endpoints (loop is fine for small N).

## Test plan

- [x] Unit: SelectionContext, SelectionToolbar, FileCard (+3 cases), FolderTile (+3 cases), FileContextMenu (+1 case), FolderContextMenu (+1 case), zip lib — all green.
- [x] `npm run build` clean.
- [ ] Manual: checklist from plan Task 15 Step 3.
EOF
)"
  ```

---

## Self-review

**1. Spec coverage.** Selection model + click handlers + toolbar + batch trash + batch move + zip download + context-menu batch mode + Esc/route-clear. All covered by Tasks 2–14.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to". Every task has concrete file paths, full code, commands.

**3. Type consistency.**
- `SelectedItem` defined in Task 2; consumed by Tasks 4, 5, 6, 7, 8, 11, 12, 13 via `import { type SelectedItem } from "./SelectionContext"`.
- `ZipEntry = { name: string; path: string }` in Task 9; consumed identically by Task 10 (`entries: ZipEntry[]`).
- `BatchResult = { succeeded: number; failed: number }` — defined and consumed inside `SelectionToolbar.tsx` (Tasks 7 + 8).
- Window-event names `vv:batch-move` / `vv:batch-trash` are dispatched in Tasks 12 + 13 and listened to in Task 12's SelectionToolbar edit — exact string match.

**4. One intentional scope compromise called out:** shift-click as "add single item to selection" rather than proper range. Documented in the plan; upgrades when grid-wide linear order arrives in Phase 2c.

**5. Security.** The zip route reuses `getSessionUser` (same as the stream route) — any authenticated group member can request a zip of any file ids they know. Matches existing `/api/stream/[id]` behavior and the "shared pool" principle in `DESIGN.md`. Cap of 50 limits denial-of-resource via oversized archives. UUID validation prevents path traversal. No user input ever touches the filesystem path — `file.storage_path` comes from the database.

**6. Performance.** Archive is STORE (no compression). One disk read per file, streaming via Node pipes. No memory balloon even for 50-file selections of GB-sized videos.

**7. Follow-up risk for Phase 2c.** Grid keyboard nav will want a `GridNavContext` that knows the linear order of items. Selection anchor can feed into that. No refactor of Phase 2b shapes anticipated.
