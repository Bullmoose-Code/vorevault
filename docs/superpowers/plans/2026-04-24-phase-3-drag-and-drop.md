# Phase 3: Drag-and-Drop Move

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click-and-drag files and folders onto other folders to move them. Works with the 2b selection model — dragging a selected item drags the whole selection; dragging an unselected item drags just that item. Drop targets are folder tiles in the grid and folders in the sidebar `VaultTree`. Server-side move already works; this is pure UX on top of existing endpoints.

**Architecture:**
- New `lib/moveItems.ts` — pure batch-move helper extracted from `SelectionToolbar`. Loops over items, hits per-kind single-item endpoints (`/api/files/:id/move` or `/api/folders/:id` PATCH with `parentId`), returns `{ succeeded, failed }`.
- New `lib/dragDrop.ts` — pure helpers: `encodeDragPayload(items)`, `decodeDragPayload(dataTransfer)`, `resolveDraggedItems(origin, selection)`. Custom MIME type `application/x-vorevault-drag`.
- `FileCard` and `FolderTile` gain `draggable={canManage}` + `onDragStart`. The payload is resolved on drag-start: if the origin card is in the current selection → drag the whole selection; otherwise drag just the origin.
- `FolderTile` + `VaultTreeView` entries are drop targets: `onDragOver` (preventDefault to enable drop + set `dropEffect`), `onDragLeave`, `onDrop` handlers. Drop target highlights with a new `.dropTarget` CSS class.
- After drop, the shared `moveItems` helper runs, a summary toast fires (reusing the existing `ItemActionProvider`'s `showToast`), and `router.refresh()` pulls the new server state.

**Tech Stack:** Next.js 15 App Router, React 19 (client components), TS strict, Vitest + jsdom, HTML5 native drag-and-drop API.

**Branch:** `feat/phase-3-drag-and-drop` — off `main`.

---

## Scope

**In:**
- Drag files (from FileCard) onto folders (FolderTile or VaultTree node) → moves them.
- Drag folders (from FolderTile) onto other folders → moves them.
- Multi-drag: if the drag originates on a selected item, the drag carries the whole selection (regardless of `draggable` attribute rules — the payload is computed in `onDragStart`).
- `draggable={canManage}` — unowned / non-admin items are not draggable at all.
- Visual feedback: dragged source(s) get `.dragging` (reduced opacity); valid drop target on hover gets `.dropTarget` (accent border).
- Invalid drops (drop on self, or drop that server rejects) fail gracefully with a toast.
- Summary toast reports success/fail counts.

**Out (deferred):**
- Drop onto breadcrumb ancestors (to move up).
- Drop onto a "Home" zone (move to root folder).
- Drop from file-detail page (`/f/[id]`) or search results.
- Auto-scroll when dragging near viewport edge.
- Custom drag image (with "3 items" counter) — we use the browser default.
- Client-side cycle detection when dragging a folder over its own descendant — let the server reject (`FolderCycleError` → toast).
- Keyboard-driven drag-and-drop (Space to "pick up" + Arrow to move) — power-user later.
- Touch DnD — HTML5 DnD doesn't work on touch; would need a polyfill or Pointer Events rewrite. Skip for MVP.

---

## Payload shape

One custom MIME type, one JSON string:

```
MIME: application/x-vorevault-drag
Value: JSON.stringify(SelectedItem[])
```

Where `SelectedItem` is the existing type from `SelectionContext`: `{ kind: "file" | "folder"; id; name; canManage; folderId | parentId }`.

Putting it under a custom MIME type means we can detect our own drags (vs. files-from-desktop drags — which the existing upload DropZone handles separately) without string-sniffing.

---

## Drag-origin → payload resolution

At drag-start, the origin card's `onDragStart` decides what's in the drag:

| Origin in selection? | Selection size | Payload |
|---|---|---|
| Yes | `>= 1` | The entire selection |
| No | (any) | Just the origin item (selection left untouched) |

**Do not** toggle origin into selection or clear selection on drag. Drive's behavior — selection is orthogonal to drag.

---

## Drop-target validity

A drop is client-accepted when:
- Target is a valid drop zone (has `data-drop-target` attribute or equivalent handler).
- Payload MIME type is `application/x-vorevault-drag`.
- Target folder id is NOT present in the payload (can't drop on self or on a folder being dragged).

Other invalid-ness (dropping a folder into its own descendant) is caught server-side via the existing `FolderCycleError`. The failure surfaces as an error toast from `moveItems`.

---

## File Structure

**Created:**
- `app/src/lib/dragDrop.ts` — pure helpers (encode/decode payload, resolve dragged items, validate drop target).
- `app/src/lib/dragDrop.test.ts`
- `app/src/lib/moveItems.ts` — shared batch-move helper. Extracted from `SelectionToolbar`.
- `app/src/lib/moveItems.test.ts`

**Modified:**
- `app/src/components/SelectionToolbar.tsx` — import `batchMove` from `lib/moveItems` instead of defining inline.
- `app/src/components/FileCard.tsx` — add `draggable` attribute + `onDragStart` handler + `.dragging` class when being dragged.
- `app/src/components/FileCard.module.css` — `.dragging` rule.
- `app/src/components/FileCard.test.tsx` — test that drag-start sets the correct payload.
- `app/src/components/FolderTile.tsx` — same drag-source treatment, PLUS drop-target handlers (`onDragOver`, `onDragLeave`, `onDrop`).
- `app/src/components/FolderTile.module.css` — `.dragging` and `.dropTarget` rules.
- `app/src/components/FolderTile.test.tsx` — test drop behavior (mocks `fetch`, asserts move endpoint hit).
- `app/src/components/VaultTreeView.tsx` — add drop handlers to each tree node.
- `app/src/components/VaultTree.module.css` — `.dropTarget` rule for tree rows.

**Not touched:**
- Server endpoints — reused as-is.
- `SelectionContext` — no API changes.
- `DESIGN.md`.

---

## Task 1: Branch + baseline

- [ ] **Step 1**
  ```bash
  git -C /root/vorevault fetch origin
  git -C /root/vorevault checkout main && git -C /root/vorevault pull --ff-only
  git -C /root/vorevault checkout -b feat/phase-3-drag-and-drop
  ```

- [ ] **Step 2: Baseline**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib/zip' 'src/lib/gridNav' 2>&1 | tail -5
  cd /root/vorevault/app && npm run build 2>&1 | tail -4
  ```
  Expected: all green, clean build.

---

## Task 2: Extract `lib/moveItems.ts`

Same logic that currently lives at the top of `SelectionToolbar.tsx`, lifted into a module so both the toolbar and the new drag-drop code share it.

**Files:**
- Create: `app/src/lib/moveItems.ts`
- Create: `app/src/lib/moveItems.test.ts`
- Modify: `app/src/components/SelectionToolbar.tsx` — replace inline function with the import.

### Step 1: Write the failing test

Write `app/src/lib/moveItems.test.ts`:

```ts
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { moveItems } from "./moveItems";
import type { SelectedItem } from "@/components/SelectionContext";

const file = (id: string): SelectedItem => ({ kind: "file", id, name: id, canManage: true, folderId: null });
const folder = (id: string): SelectedItem => ({ kind: "folder", id, name: id, canManage: true, parentId: null });

describe("moveItems", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns {succeeded, failed} with all successes", async () => {
    const result = await moveItems([file("a"), file("b")], null);
    expect(result).toEqual({ succeeded: 2, failed: 0 });
  });

  it("files use POST /api/files/:id/move with { folderId }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await moveItems([file("a")], "folder-x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/a/move",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ folderId: "folder-x" }),
      }),
    );
  });

  it("folders use PATCH /api/folders/:id with { parentId }", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await moveItems([folder("a")], "folder-x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/folders/a",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ parentId: "folder-x" }),
      }),
    );
  });

  it("counts per-item failures", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockRejectedValueOnce(new Error("network"))
    );
    const result = await moveItems([file("a"), file("b"), file("c")], null);
    expect(result).toEqual({ succeeded: 1, failed: 2 });
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- moveItems
```

### Step 3: Implement

Create `app/src/lib/moveItems.ts`:

```ts
import type { SelectedItem } from "@/components/SelectionContext";

export type BatchMoveResult = { succeeded: number; failed: number };

export async function moveItems(
  items: SelectedItem[],
  folderId: string | null,
): Promise<BatchMoveResult> {
  let succeeded = 0;
  let failed = 0;
  for (const it of items) {
    try {
      const res =
        it.kind === "file"
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

### Step 4: Refactor SelectionToolbar to use the extracted helper

In `app/src/components/SelectionToolbar.tsx`:
1. Add `import { moveItems, type BatchMoveResult } from "@/lib/moveItems";` at the top.
2. Remove the local `batchMove` function definition (the whole block that currently lives at ~line 34).
3. Remove the local `BatchResult` type if it's only used by batchMove.
4. Replace the `batchMove(...)` call site with `moveItems(...)`.
5. Types that previously referenced the local `BatchResult` now use `BatchMoveResult` from the import.

**Sanity:** the toolbar also has a `batchTrash` helper — leave that alone. Only `batchMove` is extracted.

### Step 5: Run tests + build

```bash
cd /root/vorevault/app && npm test -- moveItems SelectionToolbar
cd /root/vorevault/app && npm run build 2>&1 | tail -5
```

Expected: 4 moveItems tests pass, 10 SelectionToolbar tests still pass, clean build.

### Step 6: Commit

```bash
cd /root/vorevault
git add app/src/lib/moveItems.ts app/src/lib/moveItems.test.ts app/src/components/SelectionToolbar.tsx
git commit -m "refactor(lib): extract moveItems helper from SelectionToolbar"
```

---

## Task 3: `lib/dragDrop.ts` — payload + target helpers

**Files:**
- Create: `app/src/lib/dragDrop.ts`
- Create: `app/src/lib/dragDrop.test.ts`

### Step 1: Write the failing test

Write `app/src/lib/dragDrop.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  VV_DRAG_MIME,
  encodeDragPayload,
  decodeDragPayload,
  resolveDraggedItems,
  dropTargetIsValid,
} from "./dragDrop";
import type { SelectedItem } from "@/components/SelectionContext";

const file = (id: string): SelectedItem => ({ kind: "file", id, name: id, canManage: true, folderId: null });
const folder = (id: string): SelectedItem => ({ kind: "folder", id, name: id, canManage: true, parentId: null });

describe("encodeDragPayload / decodeDragPayload", () => {
  it("round-trips items through a DataTransfer", () => {
    const dt = new DataTransfer();
    const items = [file("a"), folder("b")];
    encodeDragPayload(dt, items);
    expect(dt.types).toContain(VV_DRAG_MIME);
    const decoded = decodeDragPayload(dt);
    expect(decoded).toEqual(items);
  });

  it("decode returns null if MIME type not present", () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "hello");
    expect(decodeDragPayload(dt)).toBeNull();
  });

  it("decode returns null if payload is not valid JSON", () => {
    const dt = new DataTransfer();
    dt.setData(VV_DRAG_MIME, "not-json");
    expect(decodeDragPayload(dt)).toBeNull();
  });

  it("decode returns null if payload is not an array of SelectedItems", () => {
    const dt = new DataTransfer();
    dt.setData(VV_DRAG_MIME, JSON.stringify({ wrong: "shape" }));
    expect(decodeDragPayload(dt)).toBeNull();
  });
});

describe("resolveDraggedItems", () => {
  it("returns the whole selection if origin is in selection", () => {
    const origin = file("a");
    const selection = [file("a"), file("b")];
    expect(resolveDraggedItems(origin, selection)).toEqual(selection);
  });

  it("returns only origin if origin not in selection", () => {
    const origin = file("a");
    const selection = [file("b"), file("c")];
    expect(resolveDraggedItems(origin, selection)).toEqual([origin]);
  });

  it("returns only origin if selection is empty", () => {
    const origin = folder("x");
    expect(resolveDraggedItems(origin, [])).toEqual([origin]);
  });
});

describe("dropTargetIsValid", () => {
  it("returns true when target folder id is not in payload", () => {
    const items = [file("a"), folder("b")];
    expect(dropTargetIsValid("other-folder", items)).toBe(true);
  });

  it("returns false when target folder id matches a folder in payload (self-drop)", () => {
    const items = [folder("target")];
    expect(dropTargetIsValid("target", items)).toBe(false);
  });

  it("returns true when target folder id equals a file id in payload (file ids and folder ids are different namespaces but we only match on folder)", () => {
    const items = [file("same-id")];
    expect(dropTargetIsValid("same-id", items)).toBe(true);
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- dragDrop
```

### Step 3: Implement

Create `app/src/lib/dragDrop.ts`:

```ts
import type { SelectedItem } from "@/components/SelectionContext";

export const VV_DRAG_MIME = "application/x-vorevault-drag";

export function encodeDragPayload(dt: DataTransfer, items: SelectedItem[]): void {
  dt.setData(VV_DRAG_MIME, JSON.stringify(items));
  dt.effectAllowed = "move";
}

export function decodeDragPayload(dt: DataTransfer): SelectedItem[] | null {
  const raw = dt.getData(VV_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    for (const p of parsed) {
      if (!p || typeof p !== "object") return null;
      if (p.kind !== "file" && p.kind !== "folder") return null;
      if (typeof p.id !== "string") return null;
    }
    return parsed as SelectedItem[];
  } catch {
    return null;
  }
}

/**
 * Decide what a drag carries: the whole selection if origin is in it,
 * otherwise just the origin.
 */
export function resolveDraggedItems(
  origin: SelectedItem,
  selection: SelectedItem[],
): SelectedItem[] {
  const inSelection = selection.some((it) => it.kind === origin.kind && it.id === origin.id);
  if (inSelection && selection.length > 0) return selection;
  return [origin];
}

/**
 * Client-side drop validity: reject drops onto a folder that's in the payload.
 * (Server handles cycle detection for folders-into-descendants.)
 */
export function dropTargetIsValid(targetFolderId: string, items: SelectedItem[]): boolean {
  for (const it of items) {
    if (it.kind === "folder" && it.id === targetFolderId) return false;
  }
  return true;
}
```

### Step 4: Run tests

```bash
cd /root/vorevault/app && npm test -- dragDrop
```

Expected: all pass.

### Step 5: Commit

```bash
cd /root/vorevault
git add app/src/lib/dragDrop.ts app/src/lib/dragDrop.test.ts
git commit -m "feat(lib): dragDrop helpers — payload encode/decode + target validation"
```

---

## Task 4: FileCard — make draggable

**Files:**
- Modify: `app/src/components/FileCard.tsx`
- Modify: `app/src/components/FileCard.module.css`
- Modify: `app/src/components/FileCard.test.tsx`

### Step 1: Update FileCard.tsx

Add imports at the top (with other `@/lib/*` imports):

```tsx
import { useState, type MouseEvent, type DragEvent } from "react";
import { encodeDragPayload, resolveDraggedItems } from "@/lib/dragDrop";
```

(`useState` may already be imported; adapt.)

Inside the `FileCard` component body, add a dragging state hook:

```tsx
const [isDragging, setIsDragging] = useState(false);
```

Add an `onDragStart` handler:

```tsx
function handleDragStart(e: DragEvent<HTMLAnchorElement>) {
  const items = resolveDraggedItems(descriptor, selection.items);
  encodeDragPayload(e.dataTransfer, items);
  setIsDragging(true);
}

function handleDragEnd() {
  setIsDragging(false);
}
```

On the returned `<a>` element:
- Add `draggable={canManage}`.
- Add `onDragStart={handleDragStart}` and `onDragEnd={handleDragEnd}`.
- Update `className` to include `styles.dragging` when `isDragging`:

```tsx
const classes = [styles.card];
if (selected) classes.push(styles.selected);
if (isDragging) classes.push(styles.dragging);
const className = classes.join(" ");
```

(If the existing className is already built inline, refactor minimally — just add the `dragging` bit.)

### Step 2: Update FileCard.module.css

Append at the end:

```css

.dragging {
  opacity: 0.4;
}
```

### Step 3: Add test

In `app/src/components/FileCard.test.tsx`, append:

```tsx
  it("is draggable when canManage is true", () => {
    const { container } = renderWithProviders(<FileCard file={makeFile({ uploader_id: "u-test" })} />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("draggable")).toBe("true");
  });

  it("is NOT draggable when canManage is false (non-owner)", () => {
    const { container } = renderWithProviders(<FileCard file={makeFile({ uploader_id: "someone-else" })} />);
    const link = container.querySelector("a")!;
    expect(link.getAttribute("draggable")).toBe("false");
  });

  it("dragstart encodes a single-item payload when origin not in selection", () => {
    const { container } = renderWithProviders(<FileCard file={makeFile()} />);
    const link = container.querySelector("a")!;
    const dt = new DataTransfer();
    link.dispatchEvent(new DragEvent("dragstart", { dataTransfer: dt, bubbles: true }));
    const raw = dt.getData("application/x-vorevault-drag");
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("file");
  });
```

(The `renderWithProviders` helper from earlier phases already wires in providers. `makeFile` default has `uploader_id: "u-owner"` — we override to simulate a non-owner for the draggable-false test. Verify the helper's default and adjust.)

### Step 4: Run

```bash
cd /root/vorevault/app && npm test -- FileCard
```

Expected: all existing + 3 new pass.

### Step 5: Commit

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx app/src/components/FileCard.module.css app/src/components/FileCard.test.tsx
git commit -m "feat(ui): FileCard draggable — encodes single or multi-select payload"
```

---

## Task 5: FolderTile — draggable + drop target

The biggest file change — folders both drag AND accept drops.

**Files:**
- Modify: `app/src/components/FolderTile.tsx`
- Modify: `app/src/components/FolderTile.module.css`
- Modify: `app/src/components/FolderTile.test.tsx`

### Step 1: Update FolderTile.tsx

Imports:

```tsx
import { useState, type MouseEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { encodeDragPayload, decodeDragPayload, resolveDraggedItems, dropTargetIsValid } from "@/lib/dragDrop";
import { moveItems } from "@/lib/moveItems";
import { useItemActions } from "./ItemActionProvider";
```

(`useRouter` for refresh; `useItemActions` for `showToast`.)

Inside the component:

```tsx
const router = useRouter();
const { showToast } = useItemActions();
const [isDragging, setIsDragging] = useState(false);
const [dropHover, setDropHover] = useState(false);

function handleDragStart(e: DragEvent<HTMLAnchorElement>) {
  const items = resolveDraggedItems(descriptor, selection.items);
  encodeDragPayload(e.dataTransfer, items);
  setIsDragging(true);
}
function handleDragEnd() { setIsDragging(false); }

function handleDragOver(e: DragEvent<HTMLAnchorElement>) {
  // Only accept our own drag type. Other drags (like file-from-desktop) fall through.
  if (!e.dataTransfer.types.includes("application/x-vorevault-drag")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  setDropHover(true);
}
function handleDragLeave() { setDropHover(false); }

async function handleDrop(e: DragEvent<HTMLAnchorElement>) {
  setDropHover(false);
  const items = decodeDragPayload(e.dataTransfer);
  if (!items) return;
  if (!dropTargetIsValid(id, items)) return;
  e.preventDefault();
  const result = await moveItems(items, id);
  if (result.failed === 0) {
    showToast({ message: `moved ${result.succeeded}`, variant: "success" });
  } else {
    showToast({ message: `moved ${result.succeeded}, failed ${result.failed}`, variant: "error" });
  }
  router.refresh();
}
```

On the `<Link>`:

```tsx
<Link
  href={`/d/${id}`}
  className={className}
  onClick={handleClick}
  aria-pressed={selected}
  data-nav-item
  data-nav-descriptor={JSON.stringify(descriptor)}
  tabIndex={0}
  draggable={canManage}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
  onDragOver={handleDragOver}
  onDragLeave={handleDragLeave}
  onDrop={handleDrop}
>
```

Update `className` to include `.dragging` or `.dropTarget`:

```tsx
const classes = [styles.tile];
if (selected) classes.push(styles.selected);
if (isDragging) classes.push(styles.dragging);
if (dropHover) classes.push(styles.dropTarget);
const className = classes.join(" ");
```

### Step 2: Update FolderTile.module.css

Append:

```css

.dragging {
  opacity: 0.4;
}

.dropTarget {
  outline: 3px dashed var(--vv-accent);
  outline-offset: 2px;
}
```

### Step 3: Tests

Add to `app/src/components/FolderTile.test.tsx`:

```tsx
  it("is draggable when canManage is true", () => {
    const { container } = renderIt({ createdBy: "u" });
    const a = container.querySelector("a")!;
    expect(a.getAttribute("draggable")).toBe("true");
  });

  it("is NOT draggable when canManage is false", () => {
    const { container } = renderIt({ createdBy: "someone-else" });
    const a = container.querySelector("a")!;
    expect(a.getAttribute("draggable")).toBe("false");
  });

  it("onDrop calls fetch to move the dragged file into this folder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { container } = renderIt({ id: "target-folder" });
      const a = container.querySelector("a")!;
      const dt = new DataTransfer();
      dt.setData(
        "application/x-vorevault-drag",
        JSON.stringify([{ kind: "file", id: "dragged-file", name: "x", canManage: true, folderId: null }]),
      );
      a.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      // wait for the async handler to finish
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files/dragged-file/move",
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("drop on self is rejected (no fetch call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { container } = renderIt({ id: "fo-self" });
      const a = container.querySelector("a")!;
      const dt = new DataTransfer();
      dt.setData(
        "application/x-vorevault-drag",
        JSON.stringify([{ kind: "folder", id: "fo-self", name: "x", canManage: true, parentId: null }]),
      );
      a.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
```

Add `import { vi } from "vitest";` at the top if not already imported.

### Step 4: Run

```bash
cd /root/vorevault/app && npm test -- FolderTile
```

Expected: existing pass + 4 new.

### Step 5: Commit

```bash
cd /root/vorevault
git add app/src/components/FolderTile.tsx app/src/components/FolderTile.module.css app/src/components/FolderTile.test.tsx
git commit -m "feat(ui): FolderTile draggable + drop target for moves"
```

---

## Task 6: VaultTreeView — drop targets on sidebar nodes

**Files:**
- Modify: `app/src/components/VaultTreeView.tsx`
- Modify: `app/src/components/VaultTree.module.css`

No new tests — the logic is identical to FolderTile's drop handler; FolderTile tests cover the core behavior.

### Step 1: Update VaultTreeView.tsx

Add imports at the top:

```tsx
"use client";

import Link from "next/link";
import { useState, useMemo, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { decodeDragPayload, dropTargetIsValid } from "@/lib/dragDrop";
import { moveItems } from "@/lib/moveItems";
import { useItemActions } from "./ItemActionProvider";
import styles from "./VaultTree.module.css";
```

Inside `TreeNode`, add the drop handlers and state:

```tsx
const router = useRouter();
const { showToast } = useItemActions();
const [dropHover, setDropHover] = useState(false);

function onDragOver(e: DragEvent<HTMLAnchorElement>) {
  if (!e.dataTransfer.types.includes("application/x-vorevault-drag")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  setDropHover(true);
}
function onDragLeave() { setDropHover(false); }
async function onDrop(e: DragEvent<HTMLAnchorElement>) {
  setDropHover(false);
  const items = decodeDragPayload(e.dataTransfer);
  if (!items) return;
  if (!dropTargetIsValid(node.id, items)) return;
  e.preventDefault();
  const result = await moveItems(items, node.id);
  if (result.failed === 0) {
    showToast({ message: `moved ${result.succeeded}`, variant: "success" });
  } else {
    showToast({ message: `moved ${result.succeeded}, failed ${result.failed}`, variant: "error" });
  }
  router.refresh();
}
```

On the `<Link>` in TreeNode:

```tsx
<Link
  href={`/d/${node.id}`}
  className={`${styles.link} ${dropHover ? styles.dropTarget : ""}`}
  onDragOver={onDragOver}
  onDragLeave={onDragLeave}
  onDrop={onDrop}
>
  {node.name}
</Link>
```

### Step 2: Update VaultTree.module.css

Add at the end:

```css

.dropTarget {
  outline: 2px dashed var(--vv-accent);
  outline-offset: 2px;
  border-radius: var(--vv-radius-sm);
}
```

### Step 3: Build check

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -5
```

Expected: clean.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/VaultTreeView.tsx app/src/components/VaultTree.module.css
git commit -m "feat(ui): VaultTree nodes accept folder/file drops"
```

---

## Task 7: Verification + PR

- [ ] **Step 1: Full unit suite**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib/zip' 'src/lib/gridNav' 'src/lib/moveItems' 'src/lib/dragDrop' 2>&1 | tail -6
  ```
  Expected: all green.

- [ ] **Step 2: Build**
  ```bash
  cd /root/vorevault/app && npm run build 2>&1 | tail -5
  ```

- [ ] **Step 3: Manual browser checks** (requires dev session)
  - Drag a file onto a folder tile → toast "moved 1", grid refreshes, file gone from origin.
  - Drag a folder onto another folder tile → toast, grid refreshes, folder moved.
  - Cmd-click 3 files, drag any of them onto a folder → toast "moved 3".
  - Non-owner tries to drag someone else's file → cursor shows "no drop" (the `<a>` isn't draggable).
  - Drag onto the same folder in sidebar `VaultTree` → works (move via sidebar).
  - Try to drop a folder onto itself → nothing happens (client-side rejection).
  - Drop a folder onto its own descendant → toast shows "failed 1" (server rejection).
  - Dragging over a target shows a dashed accent outline; leaving removes it.
  - Dragged card visually fades while dragging.

- [ ] **Step 4: Commit plan + push + open PR**
  ```bash
  cd /root/vorevault
  git add docs/superpowers/plans/2026-04-24-phase-3-drag-and-drop.md
  git commit -m "docs: Phase 3 drag-and-drop implementation plan"
  git push -u origin feat/phase-3-drag-and-drop
  gh pr create --title "feat: Phase 3 — drag-and-drop move" --body "$(cat <<'EOF'
## Summary

Drag files or folders onto folder tiles / sidebar tree entries to move them. Works with the selection model from 2b — dragging a selected item drags the whole selection, dragging an unselected item drags just that item.

- New \`lib/dragDrop.ts\` — payload encode/decode under custom MIME \`application/x-vorevault-drag\`, resolve-dragged-items helper, client-side self-drop rejection.
- New \`lib/moveItems.ts\` — shared batch-move helper (extracted from SelectionToolbar).
- FileCard + FolderTile gain \`draggable={canManage}\` + drag handlers. FolderTile + VaultTree nodes accept drops.
- Visual: \`.dragging\` fades source (40% opacity); \`.dropTarget\` gets dashed accent outline.
- Server-side moves are unchanged (reuses \`POST /api/files/:id/move\` and \`PATCH /api/folders/:id\`). Cycle detection + permission errors surface as toasts.

## Deferred

- Drop onto breadcrumb ancestors (move up).
- Drop onto \"Home\" zone (move to root).
- Custom drag image with multi-item counter.
- Touch DnD (HTML5 API doesn't support it).
- Keyboard-driven drag-and-drop.

## Test plan

- [x] Unit: \`dragDrop\` helpers (encode/decode/resolve/validate), \`moveItems\` batch loop.
- [x] Component: FileCard draggable gating, FolderTile draggable + drop, self-drop rejection.
- [x] Refactor: SelectionToolbar now imports \`moveItems\` — existing tests still pass.
- [x] \`npm run build\` clean.
- [ ] Manual: see plan Task 7 Step 3.
EOF
)"
  ```

---

## Self-review

**1. Spec coverage.** Drag sources (FileCard, FolderTile), drop targets (FolderTile, VaultTree), multi-drag resolution, self-drop rejection, `canManage` gating, summary toast, refresh — all covered by Tasks 2–6.

**2. Placeholder scan.** No TBDs, complete code in every step.

**3. Type consistency.**
- `SelectedItem` imported from `@/components/SelectionContext` throughout.
- `VV_DRAG_MIME` constant used in both dragDrop.ts and the component handlers (via the helper functions, not inlined as a string).
- `moveItems` signature `(items: SelectedItem[], folderId: string | null) => Promise<BatchMoveResult>` is consistent across SelectionToolbar and new drop handlers.

**4. React event types.**
- `DragEvent<HTMLAnchorElement>` used consistently on `<a>` and `<Link>` (which renders an `<a>`).

**5. Failure modes handled.**
- Malformed payload → `decodeDragPayload` returns null → handler no-ops.
- Foreign drag types (e.g. desktop file drops hitting our drop zone) → `dataTransfer.types` check short-circuits before `preventDefault`, letting the existing upload `DropZone` handle them.
- Self-drop → `dropTargetIsValid` returns false → handler no-ops.
- Server rejection (cycle, permission) → counted as failed, surfaced in toast.
- Network error → counted as failed in the try/catch.

**6. Coexistence with existing features.**
- Upload `DropZone` uses file-list drags from desktop (different MIME), won't conflict.
- Context menu right-click still works (separate event).
- Click + modifier-click still work (drag doesn't start until the mouse moves past the threshold).
- Keyboard nav unchanged.

**7. Follow-up.** Phase 3 dark mode is unaffected. Design-system persistence (the docs-only item) is also unaffected. Touch DnD is the most user-visible follow-up and would require rewriting source/target handlers with Pointer Events or adopting react-dnd with a touch backend.
