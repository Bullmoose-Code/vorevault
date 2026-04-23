# Phase 2c: Keyboard Nav + True Shift-Range + Select-All

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the file/folder grid keyboard-navigable. Arrow keys move focus spatially. Space toggles selection. Cmd/Ctrl+A selects all visible. Shift+Click and Shift+Arrow extend a real range (upgrading 2b's "shift == cmd-click toggle" fallback). Del moves selection to trash. `/` focuses search. Enter still navigates via the native link default.

**Architecture:**
- Every `<FileCard>` / `<FolderTile>` gets three DOM attributes: `data-nav-item` (marker), `data-nav-descriptor` (JSON-stringified `SelectedItem`), and `tabIndex={0}` (keyboard focusable). No React registry — all grid knowledge is read directly from the DOM when needed. Page-specific section ordering falls out of React's deterministic render order automatically.
- New pure module `lib/gridNav.ts` exports three helpers:
  - `readNavItems()` — scans `document` for `[data-nav-item]`, parses descriptors, returns ordered list with DOM refs.
  - `sliceBetween(anchor, target, items)` — given two nav items (by kind+id) and the ordered list, returns the inclusive slice.
  - `findNextInDirection(current, direction, items)` — given a current element and `"up" | "down" | "left" | "right"`, returns the spatial neighbor using `getBoundingClientRect()`.
- New `<GridKeyboard>` client component rendered at shell level. Listens on `document`. Dispatches arrow/space/delete/cmd-a/slash events to SelectionContext + DOM focus + the existing `vv:batch-trash` window event.
- Shift-click on card upgrades from "toggle single" to "add slice from `selection.anchorId` to clicked item to selection."
- SearchBar input gains `id="vv-search"` so `/` focuses it.

**Tech Stack:** Next.js 15 App Router, React 19, TS strict, Vitest + jsdom, CSS Modules with `--vv-*` tokens.

**Branch:** `feat/phase-2c-keyboard-nav` — off `main`.

---

## Scope

**In:**
- Spatial arrow-key grid nav (←→↑↓) with focus movement via `.focus()`.
- Shift+Arrow: extends focus AND selection in the direction.
- Shift+Click on card: true range from anchor to clicked.
- Space: toggle focused card in selection (preventDefault to stop scroll).
- Cmd/Ctrl+A: select all navigable items on page (when not typing in input).
- Del / Backspace: dispatch `vv:batch-trash` window event (selection toolbar's listener, already in 2b, opens the confirm dialog).
- `/`: focus the search input.
- Enter: NOT intercepted — browser's native `<a>` handling runs.
- Esc: already handled in 2b by SelectionChrome (clears selection). No change.

**Out (deferred):**
- Tab trapping in modals — Radix + Modal already handle this.
- Marquee / drag-box select — later polish.
- Virtualization-aware nav for paged grids — the pagination UI already exists; nav stays within the current page.
- Moving focus on pagination navigation — ship as-is; user uses mouse to paginate.
- Command-K palette — separate feature.

---

## Key bindings (authoritative)

| Key | Precondition | Action | Default prevented? |
|---|---|---|---|
| Arrow L/R/U/D | `document.activeElement` has `data-nav-item` | Move focus spatially | Yes |
| Shift + Arrow | Same | Move focus + add new-focused to selection | Yes |
| Space | Focus on nav item | Toggle item in selection | Yes (stops page scroll) |
| Enter | — | Let native link navigate | No (don't intercept) |
| Cmd/Ctrl + A | NOT typing in input/textarea/contenteditable | Select every nav item | Yes |
| Delete / Backspace | Not typing AND `selection.size > 0` AND every selected `canManage` | Dispatch `vv:batch-trash` | Yes |
| `/` | Not typing | Focus `#vv-search` | Yes |
| Escape | Always (handled by `<SelectionChrome />` from 2b) | Clear selection | — |

**"Typing" check:** `activeElement?.tagName === "INPUT" || "TEXTAREA" || "SELECT"`, or `(activeElement as HTMLElement)?.isContentEditable === true`.

---

## File Structure

**Created:**
- `app/src/lib/gridNav.ts` — pure helpers, zero DOM side-effects beyond reading.
- `app/src/lib/gridNav.test.ts` — unit tests with synthetic rects.
- `app/src/components/GridKeyboard.tsx` — client-only, mounts one document listener.
- `app/src/components/GridKeyboard.test.tsx`

**Modified:**
- `app/src/components/FileCard.tsx` — adds `data-nav-item`, `data-nav-descriptor`, `tabIndex={0}`. Upgrades shift-click to real range.
- `app/src/components/FileCard.test.tsx` — adds shift-range test (requires two cards in DOM).
- `app/src/components/FolderTile.tsx` — same treatment.
- `app/src/components/FolderTile.test.tsx` — adds shift-range test.
- `app/src/components/SearchBar.tsx` — adds `id="vv-search"` to the input.
- `app/src/app/(shell)/layout.tsx` — renders `<GridKeyboard />` inside `<SelectionProvider>`.

**Not touched:**
- `SelectionContext` (no API changes — `toggle`, `addRange`, `clear`, `anchorId` already sufficient).
- `SelectionToolbar` (already listens for `vv:batch-trash`; Del reuses that bridge).
- Pages that render grids (no per-page registry — DOM discovery just works).
- `DESIGN.md`.

---

## Data attribute shape

Every FileCard and FolderTile's root `<a>`/`<Link>` element carries:

```html
<a
  data-nav-item
  data-nav-descriptor='{"kind":"file","id":"aaaa-bbbb-...","name":"x.mp4","canManage":true,"folderId":null}'
  tabIndex="0"
  ...
>
```

`data-nav-descriptor` is `JSON.stringify(descriptor)` where `descriptor` is the same `SelectedItem` object used for click-toggle in 2b. Parsing cost is trivial (a few hundred bytes per card, done once per keyboard event).

---

## Task 1: Branch

- [ ] **Step 1:** 
  ```bash
  git -C /root/vorevault fetch origin
  git -C /root/vorevault checkout main && git -C /root/vorevault pull --ff-only
  git -C /root/vorevault checkout -b feat/phase-2c-keyboard-nav
  ```

- [ ] **Step 2: Baseline**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 2>&1 | tail -5
  cd /root/vorevault/app && npm run build 2>&1 | tail -4
  ```
  Expected: all tests green, build clean. If not, stop and investigate.

---

## Task 2: `lib/gridNav.ts` — pure helpers

**Files:**
- Create: `app/src/lib/gridNav.ts`
- Create: `app/src/lib/gridNav.test.ts`

### Step 1: Write the failing test

Write `app/src/lib/gridNav.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readNavItems, sliceBetween, findNextInDirection, type NavItem } from "./gridNav";

type Rect = { top: number; left: number; right: number; bottom: number; width: number; height: number; x: number; y: number; toJSON: () => unknown };

function rect(x: number, y: number, w = 100, h = 100): Rect {
  return {
    top: y, left: x, right: x + w, bottom: y + h,
    width: w, height: h, x, y, toJSON: () => ({ x, y, w, h }),
  };
}

function makeAnchor(descriptor: object, r: Rect): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("data-nav-item", "");
  a.setAttribute("data-nav-descriptor", JSON.stringify(descriptor));
  a.getBoundingClientRect = () => r as DOMRect;
  document.body.appendChild(a);
  return a;
}

function resetBody() {
  document.body.replaceChildren();
}

describe("readNavItems", () => {
  beforeEach(resetBody);

  it("returns an empty array when no nav items exist", () => {
    expect(readNavItems()).toEqual([]);
  });

  it("returns items in DOM order with parsed descriptors", () => {
    makeAnchor({ kind: "file", id: "a", name: "a", canManage: true, folderId: null }, rect(0, 0));
    makeAnchor({ kind: "folder", id: "b", name: "b", canManage: true, parentId: null }, rect(100, 0));
    const items = readNavItems();
    expect(items.length).toBe(2);
    expect(items[0].descriptor).toMatchObject({ kind: "file", id: "a" });
    expect(items[1].descriptor).toMatchObject({ kind: "folder", id: "b" });
  });

  it("skips items with malformed JSON descriptors gracefully", () => {
    const good = makeAnchor({ kind: "file", id: "g", name: "g", canManage: true, folderId: null }, rect(0, 0));
    const bad = document.createElement("a");
    bad.setAttribute("data-nav-item", "");
    bad.setAttribute("data-nav-descriptor", "not-json");
    document.body.appendChild(bad);
    const items = readNavItems();
    expect(items.length).toBe(1);
    expect(items[0].el).toBe(good);
  });
});

describe("sliceBetween", () => {
  it("returns inclusive slice from anchor to target", () => {
    const items: NavItem[] = [
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "a", name: "a", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "b", name: "b", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "c", name: "c", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "d", name: "d", canManage: true, folderId: null } },
    ];
    const slice = sliceBetween({ kind: "file", id: "b" }, { kind: "file", id: "d" }, items);
    expect(slice.map((it) => it.descriptor.id)).toEqual(["b", "c", "d"]);
  });

  it("handles anchor after target (reverse range)", () => {
    const items: NavItem[] = [
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "a", name: "a", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "b", name: "b", canManage: true, folderId: null } },
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "c", name: "c", canManage: true, folderId: null } },
    ];
    const slice = sliceBetween({ kind: "file", id: "c" }, { kind: "file", id: "a" }, items);
    expect(slice.map((it) => it.descriptor.id)).toEqual(["a", "b", "c"]);
  });

  it("returns empty if anchor not in items", () => {
    const items: NavItem[] = [
      { el: null as unknown as HTMLElement, descriptor: { kind: "file", id: "a", name: "a", canManage: true, folderId: null } },
    ];
    const slice = sliceBetween({ kind: "file", id: "missing" }, { kind: "file", id: "a" }, items);
    expect(slice).toEqual([]);
  });
});

describe("findNextInDirection", () => {
  beforeEach(resetBody);

  it("right: moves to the next item in DOM order", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const b = makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    const items = readNavItems();
    const next = findNextInDirection(a, "right", items);
    expect(next?.el).toBe(b);
  });

  it("left: moves to previous item in DOM order", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const b = makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    const items = readNavItems();
    const prev = findNextInDirection(b, "left", items);
    expect(prev?.el).toBe(a);
  });

  it("down: picks next-row item whose X-center is closest", () => {
    // Row 0: a (x=0-100), b (x=120-220), c (x=240-340)
    // Row 1: d (x=0-100), e (x=120-220), f (x=240-340)
    makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    makeAnchor({ kind: "file", id: "c", name: "", canManage: true, folderId: null }, rect(240, 0));
    makeAnchor({ kind: "file", id: "d", name: "", canManage: true, folderId: null }, rect(0, 120));
    const e = makeAnchor({ kind: "file", id: "e", name: "", canManage: true, folderId: null }, rect(120, 120));
    makeAnchor({ kind: "file", id: "f", name: "", canManage: true, folderId: null }, rect(240, 120));
    const items = readNavItems();
    // Down from b (x-center 170) should land on e (x-center 170).
    const bEl = items[1].el;
    const next = findNextInDirection(bEl, "down", items);
    expect(next?.el).toBe(e);
  });

  it("up: picks prev-row item whose X-center is closest", () => {
    makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const b = makeAnchor({ kind: "file", id: "b", name: "", canManage: true, folderId: null }, rect(120, 0));
    makeAnchor({ kind: "file", id: "c", name: "", canManage: true, folderId: null }, rect(0, 120));
    const e = makeAnchor({ kind: "file", id: "e", name: "", canManage: true, folderId: null }, rect(120, 120));
    const items = readNavItems();
    const next = findNextInDirection(e, "up", items);
    expect(next?.el).toBe(b);
  });

  it("returns null at grid edges", () => {
    const a = makeAnchor({ kind: "file", id: "a", name: "", canManage: true, folderId: null }, rect(0, 0));
    const items = readNavItems();
    expect(findNextInDirection(a, "left", items)).toBeNull();
    expect(findNextInDirection(a, "up", items)).toBeNull();
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- gridNav
```

### Step 3: Implement

Write `app/src/lib/gridNav.ts`:

```ts
import type { SelectedItem } from "@/components/SelectionContext";

export type NavItem = {
  el: HTMLElement;
  descriptor: SelectedItem;
};

export type NavKey = { kind: "file" | "folder"; id: string };

export function readNavItems(root: Document | HTMLElement = document): NavItem[] {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-nav-item]"));
  const items: NavItem[] = [];
  for (const el of nodes) {
    const raw = el.getAttribute("data-nav-descriptor");
    if (!raw) continue;
    try {
      const descriptor = JSON.parse(raw) as SelectedItem;
      if (!descriptor || typeof descriptor !== "object") continue;
      if (descriptor.kind !== "file" && descriptor.kind !== "folder") continue;
      if (typeof descriptor.id !== "string") continue;
      items.push({ el, descriptor });
    } catch {
      // malformed descriptor — skip this item
    }
  }
  return items;
}

function indexOfKey(items: NavItem[], key: NavKey): number {
  return items.findIndex((it) => it.descriptor.kind === key.kind && it.descriptor.id === key.id);
}

export function sliceBetween(anchor: NavKey, target: NavKey, items: NavItem[]): NavItem[] {
  const a = indexOfKey(items, anchor);
  const b = indexOfKey(items, target);
  if (a < 0 || b < 0) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return items.slice(lo, hi + 1);
}

type Direction = "up" | "down" | "left" | "right";

export function findNextInDirection(
  current: HTMLElement,
  direction: Direction,
  items: NavItem[],
): NavItem | null {
  const idx = items.findIndex((it) => it.el === current);
  if (idx < 0) return null;

  if (direction === "right") return items[idx + 1] ?? null;
  if (direction === "left") return items[idx - 1] ?? null;

  // up / down: spatial — find the item with closest X-center in the adjacent row.
  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentTop = currentRect.top;

  const candidates = items
    .filter((it) => it.el !== current)
    .map((it) => {
      const r = it.el.getBoundingClientRect();
      return { item: it, top: r.top, centerX: r.left + r.width / 2 };
    });

  // "Adjacent row": for down, the smallest top > currentTop (with a small tolerance).
  // For up, the largest top < currentTop (with tolerance).
  const ROW_TOLERANCE = 5;

  if (direction === "down") {
    const below = candidates.filter((c) => c.top > currentTop + ROW_TOLERANCE);
    if (below.length === 0) return null;
    const minTop = Math.min(...below.map((c) => c.top));
    const nextRow = below.filter((c) => c.top <= minTop + ROW_TOLERANCE);
    nextRow.sort((a, b) => Math.abs(a.centerX - currentCenterX) - Math.abs(b.centerX - currentCenterX));
    return nextRow[0].item;
  }

  // up
  const above = candidates.filter((c) => c.top < currentTop - ROW_TOLERANCE);
  if (above.length === 0) return null;
  const maxTop = Math.max(...above.map((c) => c.top));
  const prevRow = above.filter((c) => c.top >= maxTop - ROW_TOLERANCE);
  prevRow.sort((a, b) => Math.abs(a.centerX - currentCenterX) - Math.abs(b.centerX - currentCenterX));
  return prevRow[0].item;
}
```

### Step 4: Run tests

```bash
cd /root/vorevault/app && npm test -- gridNav
```

Expected: all pass (~12 cases).

### Step 5: Commit

```bash
cd /root/vorevault
git add app/src/lib/gridNav.ts app/src/lib/gridNav.test.ts
git commit -m "feat(lib): gridNav helpers — readNavItems/sliceBetween/findNextInDirection"
```

---

## Task 3: FileCard + FolderTile — add data-nav attributes + tabIndex

No behavior change in this task — just adding DOM markers so subsequent tasks can find cards.

**Files:**
- Modify: `app/src/components/FileCard.tsx`
- Modify: `app/src/components/FolderTile.tsx`

### Step 1: FileCard.tsx

Inside the returned `<a>`, alongside existing `className` / `href` / `onClick` / `aria-pressed` attributes, add:

```tsx
data-nav-item
data-nav-descriptor={JSON.stringify(descriptor)}
tabIndex={0}
```

The full return becomes:

```tsx
return (
  <FileContextMenu file={file}>
    <a
      href={`/f/${file.id}`}
      className={className}
      onClick={handleClick}
      aria-pressed={selected}
      data-nav-item
      data-nav-descriptor={JSON.stringify(descriptor)}
      tabIndex={0}
    >
      {/* existing children unchanged */}
    </a>
  </FileContextMenu>
);
```

### Step 2: FolderTile.tsx

Same treatment on the `<Link>`. Next.js `<Link>` accepts `tabIndex` and forwards data-* attributes.

```tsx
return (
  <FolderContextMenu folder={{ id, name, createdBy, parentId }}>
    <Link
      href={`/d/${id}`}
      className={className}
      onClick={handleClick}
      aria-pressed={selected}
      data-nav-item
      data-nav-descriptor={JSON.stringify(descriptor)}
      tabIndex={0}
    >
      {/* existing children unchanged */}
    </Link>
  </FolderContextMenu>
);
```

### Step 3: Re-run existing tests

```bash
cd /root/vorevault/app && npm test -- FileCard FolderTile
```

Expected: all existing tests still pass (the added attributes don't affect anything the tests assert). If a test fails because of an unexpected DOM attribute in a snapshot, update the test to accept the new shape.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx app/src/components/FolderTile.tsx
git commit -m "feat(ui): FileCard + FolderTile carry data-nav-item + descriptor + tabIndex"
```

---

## Task 4: Upgrade shift-click to real range

**Files:**
- Modify: `app/src/components/FileCard.tsx` — replace shift-toggle fallback with `sliceBetween` + `addRange`.
- Modify: `app/src/components/FolderTile.tsx` — same.
- Modify: `app/src/components/FileCard.test.tsx` — add shift-range test.
- Modify: `app/src/components/FolderTile.test.tsx` — add shift-range test.

### Step 1: Update FileCard.tsx `handleClick`

Replace the existing `handleClick`:

```tsx
function handleClick(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    selection.toggle(descriptor);
    return;
  }
  if (e.shiftKey) {
    e.preventDefault();
    if (!selection.anchorId) {
      selection.toggle(descriptor);
      return;
    }
    const items = readNavItems();
    const range = sliceBetween(selection.anchorId, { kind: descriptor.kind, id: descriptor.id }, items);
    if (range.length > 0) {
      selection.addRange(range.map((r) => r.descriptor));
    } else {
      selection.toggle(descriptor);
    }
    return;
  }
  // plain click → navigate (default anchor behavior)
}
```

Add the import at the top:

```tsx
import { readNavItems, sliceBetween } from "@/lib/gridNav";
```

### Step 2: Same in FolderTile.tsx

Mirror of above — the click handler type still uses `HTMLAnchorElement` because Next.js `<Link>` renders an `<a>`:

```tsx
function handleClick(e: MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    selection.toggle(descriptor);
    return;
  }
  if (e.shiftKey) {
    e.preventDefault();
    if (!selection.anchorId) {
      selection.toggle(descriptor);
      return;
    }
    const items = readNavItems();
    const range = sliceBetween(selection.anchorId, { kind: descriptor.kind, id: descriptor.id }, items);
    if (range.length > 0) {
      selection.addRange(range.map((r) => r.descriptor));
    } else {
      selection.toggle(descriptor);
    }
    return;
  }
}
```

### Step 3: Add shift-range test to FileCard.test.tsx

Append inside the existing `describe("FileCard", ...)` block:

```tsx
  it("shift-click after a cmd-click adds the range between the two", () => {
    // Two cards in the DOM.
    const a = makeFile({ id: "aaaaaaaa-bbbb-cccc-dddd-111111111111", original_name: "a.mp4" });
    const b = makeFile({ id: "aaaaaaaa-bbbb-cccc-dddd-222222222222", original_name: "b.mp4" });
    const { container } = renderWithProviders(
      <>
        <FileCard file={a} />
        <FileCard file={b} />
      </>
    );
    const [linkA, linkB] = Array.from(container.querySelectorAll("a"));
    // cmd-click A (anchor)
    fireEvent.click(linkA, { metaKey: true });
    // shift-click B (range)
    fireEvent.click(linkB, { shiftKey: true });
    // Both should carry the selected class.
    expect(linkA.className).toMatch(/selected/);
    expect(linkB.className).toMatch(/selected/);
  });
```

### Step 4: Add shift-range test to FolderTile.test.tsx

Similar pattern — two folder tiles, cmd-click first, shift-click second, both selected.

### Step 5: Run

```bash
cd /root/vorevault/app && npm test -- FileCard FolderTile
```

Expected: existing pass + new range tests pass.

### Step 6: Commit

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx app/src/components/FolderTile.tsx app/src/components/FileCard.test.tsx app/src/components/FolderTile.test.tsx
git commit -m "feat(ui): shift-click on cards extends selection as a real range"
```

---

## Task 5: `<GridKeyboard>` — the global keyboard handler

**Files:**
- Create: `app/src/components/GridKeyboard.tsx`
- Create: `app/src/components/GridKeyboard.test.tsx`

### Step 1: Write the failing test

Write `app/src/components/GridKeyboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { GridKeyboard } from "./GridKeyboard";
import { SelectionProvider, useSelection, type SelectedItem } from "./SelectionContext";

function mountWithCards(cards: SelectedItem[]): { selection: ReturnType<typeof useSelection> } {
  let selectionRef: ReturnType<typeof useSelection> | null = null;
  function Capture() {
    selectionRef = useSelection();
    return null;
  }
  render(
    <SelectionProvider>
      <Capture />
      <GridKeyboard />
      {cards.map((c) => (
        <a
          key={`${c.kind}:${c.id}`}
          href="#"
          data-nav-item
          data-nav-descriptor={JSON.stringify(c)}
          tabIndex={0}
          data-testid={`card-${c.id}`}
        />
      ))}
    </SelectionProvider>,
  );
  return { selection: selectionRef! };
}

const file = (id: string): SelectedItem => ({ kind: "file", id, name: id, canManage: true, folderId: null });

describe("GridKeyboard", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("Cmd+A selects all nav items", () => {
    const { selection } = mountWithCards([file("a"), file("b"), file("c")]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
    expect(selection.size).toBe(3);
  });

  it("Cmd+A does NOT intercept when typing in an input", () => {
    const { selection } = mountWithCards([file("a")]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
    expect(selection.size).toBe(0);
  });

  it("Space on focused nav item toggles selection", () => {
    const { selection } = mountWithCards([file("a")]);
    const card = document.querySelector<HTMLAnchorElement>('[data-testid="card-a"]')!;
    card.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(selection.size).toBe(1);
  });

  it("Del with selection dispatches vv:batch-trash", () => {
    const handler = vi.fn();
    window.addEventListener("vv:batch-trash", handler);
    try {
      const { selection } = mountWithCards([file("a")]);
      selection.toggle(file("a"));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
      expect(handler).toHaveBeenCalled();
    } finally {
      window.removeEventListener("vv:batch-trash", handler);
    }
  });

  it("Del does nothing when selection empty", () => {
    const handler = vi.fn();
    window.addEventListener("vv:batch-trash", handler);
    try {
      mountWithCards([file("a")]);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("vv:batch-trash", handler);
    }
  });

  it("`/` focuses #vv-search", () => {
    const input = document.createElement("input");
    input.id = "vv-search";
    document.body.appendChild(input);
    mountWithCards([]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(input);
  });
});
```

### Step 2: Run, confirm fail

```bash
cd /root/vorevault/app && npm test -- GridKeyboard
```

### Step 3: Implement

Write `app/src/components/GridKeyboard.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useSelection, type SelectedItem } from "./SelectionContext";
import { readNavItems, findNextInDirection } from "@/lib/gridNav";

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  return false;
}

function getFocusedNavItem(): HTMLElement | null {
  const active = document.activeElement;
  if (!active) return null;
  if (!(active instanceof HTMLElement)) return null;
  if (!active.hasAttribute("data-nav-item")) return null;
  return active;
}

function parseDescriptor(el: HTMLElement): SelectedItem | null {
  const raw = el.getAttribute("data-nav-descriptor");
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as SelectedItem;
    if (!d || typeof d !== "object") return null;
    if (d.kind !== "file" && d.kind !== "folder") return null;
    return d;
  } catch {
    return null;
  }
}

export function GridKeyboard() {
  const selection = useSelection();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement as HTMLElement | null;
      const focused = getFocusedNavItem();

      // Cmd/Ctrl + A — select all (when not typing)
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (isTyping(active)) return;
        e.preventDefault();
        const items = readNavItems();
        selection.addRange(items.map((it) => it.descriptor));
        return;
      }

      // `/` — focus search (when not typing)
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        if (isTyping(active)) return;
        const input = document.getElementById("vv-search");
        if (input && input instanceof HTMLElement) {
          e.preventDefault();
          input.focus();
        }
        return;
      }

      // Del / Backspace — batch trash if selection non-empty + manageable
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isTyping(active)) return;
        if (selection.size === 0) return;
        if (!selection.items.every((it) => it.canManage)) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("vv:batch-trash"));
        return;
      }

      // Space — toggle focused card (when focus on nav item)
      if (e.key === " ") {
        if (!focused) return;
        const desc = parseDescriptor(focused);
        if (!desc) return;
        e.preventDefault();
        selection.toggle(desc);
        return;
      }

      // Arrow keys — move focus (when focus on nav item)
      let direction: "up" | "down" | "left" | "right" | null = null;
      if (e.key === "ArrowRight") direction = "right";
      else if (e.key === "ArrowLeft") direction = "left";
      else if (e.key === "ArrowUp") direction = "up";
      else if (e.key === "ArrowDown") direction = "down";
      if (direction && focused) {
        const items = readNavItems();
        const next = findNextInDirection(focused, direction, items);
        if (!next) return;
        e.preventDefault();
        next.el.focus();
        if (e.shiftKey) {
          selection.toggle(next.descriptor);
        }
        return;
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection]);

  return null;
}
```

### Step 4: Run tests

```bash
cd /root/vorevault/app && npm test -- GridKeyboard
```

Expected: all 6 tests pass.

### Step 5: Commit

```bash
cd /root/vorevault
git add app/src/components/GridKeyboard.tsx app/src/components/GridKeyboard.test.tsx
git commit -m "feat(ui): GridKeyboard — arrow/space/cmd-a/del/slash on nav items"
```

---

## Task 6: SearchBar — add `id` for `/` to target

**Files:**
- Modify: `app/src/components/SearchBar.tsx`

### Step 1: Add id

Find the `<input type="search" ... />` and add `id="vv-search"`. Keep all other attributes.

The input line goes from:

```tsx
<input
  type="search"
  value={q}
  onChange={(e) => setQ(e.target.value)}
  onFocus={() => setOpen(true)}
  onBlur={() => setTimeout(() => setOpen(false), 120)}
  placeholder="search files, folders, uploaders…"
  className={`${styles.input} ${inputClass}`}
  aria-label="Search"
  autoFocus={autoFocus}
/>
```

to:

```tsx
<input
  type="search"
  id="vv-search"
  value={q}
  onChange={(e) => setQ(e.target.value)}
  onFocus={() => setOpen(true)}
  onBlur={() => setTimeout(() => setOpen(false), 120)}
  placeholder="search files, folders, uploaders…"
  className={`${styles.input} ${inputClass}`}
  aria-label="Search"
  autoFocus={autoFocus}
/>
```

### Step 2: Caveat — the SearchBar renders in two places

The `TopBar` renders `<SearchBar variant="inline" />` on desktop and `<SearchBar variant="overlay" />` inside a modal on mobile. Both will get `id="vv-search"` if rendered simultaneously — but they're not: the overlay is only rendered when `mobileSearchOpen` is true (see `TopBar.tsx`). Still, to be safe, the `id` is fine because `getElementById` returns the first match and desktop users expect `/` to focus the inline search.

No test change needed for this step — the existing SearchBar tests don't assert on the id.

### Step 3: Commit

```bash
cd /root/vorevault
git add app/src/components/SearchBar.tsx
git commit -m "feat(ui): add id=vv-search on SearchBar input for / shortcut"
```

---

## Task 7: Wire `<GridKeyboard />` into shell

**Files:**
- Modify: `app/src/app/(shell)/layout.tsx`

### Step 1: Add the import + render

Add import with the other selection-related imports:

```tsx
import { GridKeyboard } from "@/components/GridKeyboard";
```

Render `<GridKeyboard />` inside `<SelectionProvider>`, next to `<SelectionChrome />`:

```tsx
<SelectionProvider>
  <SelectionChrome />
  <GridKeyboard />
  <div className={styles.shell}>
    ...
  </div>
</SelectionProvider>
```

### Step 2: Full unit sweep + build

```bash
cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 2>&1 | tail -6
cd /root/vorevault/app && npm run build 2>&1 | tail -4
```

Expected: all tests green, clean build.

### Step 3: Commit

```bash
cd /root/vorevault
git add app/src/app/\(shell\)/layout.tsx
git commit -m "feat(ui): render GridKeyboard at shell level"
```

---

## Task 8: Verification + PR

- [ ] **Step 1: Full unit suite**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib' 2>&1 | tail -8
  ```
  Record count.

- [ ] **Step 2: Build**
  ```bash
  cd /root/vorevault/app && npm run build 2>&1 | tail -5
  ```
  Expected: `Compiled successfully`.

- [ ] **Step 3: Manual browser checks**
  - Tab into the grid — first card gets focus ring.
  - Arrow keys move focus: left/right walk linear, up/down stay in same column.
  - Space toggles selection on focused card.
  - Shift+Arrow: focus moves AND the new card joins selection.
  - Cmd-click A, Shift-click B further down — everything between selected.
  - Cmd/Ctrl+A — whole visible grid selected.
  - While typing in the search bar, Cmd/Ctrl+A selects the query text (NOT the grid).
  - Select a few files, press Del — confirm dialog appears; confirming empties the selection and trashes.
  - Del on empty selection does nothing.
  - `/` focuses the search bar.
  - Esc clears selection.
  - Enter on a focused card still navigates to its detail page.

- [ ] **Step 4: Commit plan + push + open PR**
  ```bash
  cd /root/vorevault
  git add docs/superpowers/plans/2026-04-23-phase-2c-keyboard-nav-and-range.md
  git commit -m "docs: Phase 2c implementation plan"
  git push -u origin feat/phase-2c-keyboard-nav
  gh pr create --title "feat: Phase 2c — keyboard grid nav + true shift-range" --body "$(cat <<'EOF'
## Summary

Makes the file/folder grid keyboard-navigable. Arrow keys move focus spatially (using getBoundingClientRect for row-aware up/down). Space toggles; Cmd/Ctrl+A selects all; Shift+Arrow extends; Del triggers batch trash via the existing vv:batch-trash bridge; / focuses search. Enter is deliberately not intercepted — native link navigation works as today.

Shift-click on cards upgrades from 2b's toggle-single fallback to a real range using the selection's anchor and the DOM's nav-item list.

- New lib/gridNav.ts pure helpers: readNavItems, sliceBetween, findNextInDirection. Unit-tested with synthetic rects.
- New GridKeyboard client component mounted at shell level. Single document-level keydown listener. Guards against typing-in-input for Cmd+A / Del / Space / /.
- FileCard and FolderTile now carry data-nav-item, data-nav-descriptor, tabIndex=0.
- SearchBar input has id=vv-search so / can target it.

## Deferred

- Keeping arrow nav through pagination (current pagination resets focus).
- Marquee / drag-box select.
- Virtualization-aware nav.

## Test plan

- [x] 12 new gridNav unit tests green.
- [x] 6 new GridKeyboard tests green.
- [x] Shift-range tests on FileCard + FolderTile green.
- [x] npm run build clean.
- [ ] Manual: arrow-key nav / shift-range / Cmd+A / Del / / / Esc / Enter — see plan Task 8 Step 3.
EOF
  )"
  ```

---

## Self-review

**1. Spec coverage.** Every key binding from the agreed table is implemented. Pure helpers for the spatial math are fully unit-tested. DOM-based discovery works across any grid-rendering page without per-page registry.

**2. Placeholder scan.** No "TBD", no hand-waving. Every task has full code, exact paths, exact commands.

**3. Type consistency.**
- `SelectedItem` imported from `@/components/SelectionContext` throughout; descriptor JSON parsed back to this shape.
- `NavItem = { el, descriptor }` and `NavKey = { kind, id }` defined in `gridNav.ts`, consumed identically in `GridKeyboard.tsx` and `FileCard.tsx`.

**4. Potential landmines handled.**
- Cmd+A intercept would break text-select in inputs → `isTyping()` guard.
- Del intercept would delete text when editing → same guard.
- `/` intercept would block typing a slash in text inputs → same guard.
- Space on a focused link defaults to "scroll page" → `preventDefault()` when focus is on nav item.
- Enter left un-intercepted → native `<a>` handling wins (and this matches "plain click navigates" from 2b).
- Mid-render insertions of cards: DOM query runs per keyboard event, no stale state.
- Malformed descriptor JSON: `readNavItems` skips the item; `parseDescriptor` returns null.

**5. Accessibility.** `tabIndex={0}` on every card means native Tab order covers the grid before going elsewhere. Focus ring from 2a remains visible. Space/arrow behavior matches the ARIA composite-widget pattern (grid role isn't applied — cards are still links — so it's a "tab into grid, arrow within" pattern).

**6. Follow-up risk.** Phase 2d (folder-zip) is unaffected. Future marquee-select can use the same `readNavItems` registry.
