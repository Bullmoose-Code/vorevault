# Drive Redesign — Plan 1: Layout Shell & Nav

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin VoreVault as a Drive-like shell — persistent left sidebar with `+ new`, primary nav, vault folder tree, and a global storage indicator — without changing any data semantics. Trash and recursive folder upload land in Plans 2 and 3.

**Architecture:** New `app/(shell)/` route group that wraps every authenticated page in a `Sidebar + TopBar + content` layout. New components: `Sidebar`, `VaultTree`, `StorageBar`, `NewMenu`, `MobileFAB`. Existing pages (home, `/d/[id]`, `/f/[id]`, `/search`, `/admin`, `/upload`) get moved into the route group; `/saved` is renamed to `/starred` and `/saved` keeps a 308 redirect via middleware. New nav-only pages added: `/recent`, `/mine`. Home page restructured to `recent strip → folders → all clips`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Postgres 16 via `pg` Pool, Vitest + testcontainers, CSS Modules with `--vv-*` design tokens.

**Spec:** `docs/superpowers/specs/2026-04-22-drive-redesign-design.md`

**Branch:** `feat/drive-redesign-layout-shell` (branch off `main`; the spec is already on `feat/drive-redesign-spec` — rebase or cherry-pick the spec commit onto this branch first if it hasn't merged yet).

---

## File Structure

**Created:**
- `app/src/lib/storage-stats.ts` — `getStorageStats()` with 60s in-process cache.
- `app/src/lib/storage-stats.test.ts`
- `app/src/app/api/storage/stats/route.ts` — `GET /api/storage/stats`
- `app/src/app/api/storage/stats/route.test.ts`
- `app/src/components/StorageBar.tsx` + `.module.css` + `.test.tsx`
- `app/src/components/VaultTree.tsx` (server) + `VaultTreeView.tsx` (client) + `.module.css` + `VaultTreeView.test.tsx`
- `app/src/components/NewMenu.tsx` (client) + `.module.css` + `.test.tsx`
- `app/src/components/Sidebar.tsx` (server) + `SidebarChrome.tsx` (client provider for drawer state) + `.module.css`
- `app/src/components/MobileFAB.tsx` (client) + `.module.css`
- `app/src/components/RecentStrip.tsx` + `.module.css`
- `app/src/app/(shell)/layout.tsx` — auth check + render shell
- `app/src/app/(shell)/page.tsx` — home (moved from `app/page.tsx`)
- `app/src/app/(shell)/recent/page.tsx`
- `app/src/app/(shell)/mine/page.tsx`
- `app/src/app/(shell)/starred/page.tsx` (moved from `/saved`)

**Moved (no code change beyond import paths):**
- `app/src/app/d/[id]/` → `app/src/app/(shell)/d/[id]/`
- `app/src/app/f/[id]/` → `app/src/app/(shell)/f/[id]/`
- `app/src/app/search/` → `app/src/app/(shell)/search/`
- `app/src/app/admin/` → `app/src/app/(shell)/admin/`
- `app/src/app/upload/` → `app/src/app/(shell)/upload/` (will be removed in Plan 3)

**Modified:**
- `app/src/components/TopBar.tsx` — remove upload pill; add hamburger toggle on mobile.
- `app/src/components/UserChip.tsx` — drop the admin link (moves to sidebar).
- `app/src/lib/files.ts` — add an optional `offset` arg to `listFiles` and a new `listRecentFiles(limit)` helper.
- `app/src/lib/files.test.ts` — cover new offset behavior.
- `app/src/middleware.ts` — add 308 redirect from `/saved/*` to `/starred/*`.
- `app/src/app/layout.tsx` — no shell here; remains the root font/manifest layout.

**Deleted:**
- `app/src/app/page.tsx` (replaced by `(shell)/page.tsx`)
- `app/src/app/saved/` (replaced by `(shell)/starred/`)
- `app/src/app/page.module.css` (CSS moves into the new `(shell)/page.module.css`)

---

## Task 1: Storage stats lib (sum + statvfs with cache)

**Files:**
- Create: `app/src/lib/storage-stats.ts`
- Test:   `app/src/lib/storage-stats.test.ts`

- [ ] **Step 1: Write the failing test (cache + shape)**

```ts
// app/src/lib/storage-stats.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  pool: { query: vi.fn() },
}));
vi.mock("node:fs/promises", () => ({
  statfs: vi.fn(),
}));

import { pool } from "@/lib/db";
import { statfs } from "node:fs/promises";
import { getStorageStats, _resetStorageStatsCache } from "./storage-stats";

describe("getStorageStats", () => {
  beforeEach(() => {
    _resetStorageStatsCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns used_bytes from sum and total_bytes from statfs", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ used_bytes: "1500" }],
    });
    (statfs as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      blocks: 100n,
      bsize: 4096n,
    });

    const stats = await getStorageStats();
    expect(stats).toEqual({
      used_bytes: 1500,
      total_bytes: 409600,
      used_fraction: 1500 / 409600,
    });
  });

  it("does not cache when total_bytes is zero (statfs anomaly)", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ used_bytes: "100" }],
    });
    (statfs as ReturnType<typeof vi.fn>).mockResolvedValue({ blocks: 0n, bsize: 0n });

    const a = await getStorageStats();
    const b = await getStorageStats();
    expect(a.total_bytes).toBe(0);
    expect(b.total_bytes).toBe(0);
    expect(pool.query).toHaveBeenCalledTimes(2);  // not cached
  });

  it("caches results for 60 seconds", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ used_bytes: "1000" }],
    });
    (statfs as ReturnType<typeof vi.fn>).mockResolvedValue({
      blocks: 1n,
      bsize: 1000n,
    });

    await getStorageStats();
    await getStorageStats();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(statfs).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61_000);
    await getStorageStats();
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(statfs).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd app && npx vitest run src/lib/storage-stats.test.ts
```
Expected: FAIL with "Cannot find module './storage-stats'".

- [ ] **Step 3: Implement**

First add a `totalBytes` helper next to the existing `freeBytes` in `app/src/lib/storage.ts` so the disk-capacity concept lives in one place:

```ts
// Append to app/src/lib/storage.ts
export async function totalBytes(dir: string): Promise<bigint> {
  const stats = await statfs(dir, { bigint: true });
  return stats.blocks * stats.bsize;
}
```

Then implement `storage-stats.ts` on top of it, reusing `DATA_ROOT` from the same module — no new env var:

```ts
// app/src/lib/storage-stats.ts
import { pool } from "@/lib/db";
import { DATA_ROOT, totalBytes } from "@/lib/storage";

export type StorageStats = {
  used_bytes: number;
  total_bytes: number;
  used_fraction: number;  // 0..1; named "fraction" not "pct" because it's not multiplied by 100
};

const TTL_MS = 60_000;

let cache: { value: StorageStats; expires: number } | null = null;

export function _resetStorageStatsCache(): void {
  cache = null;
}

export async function getStorageStats(): Promise<StorageStats> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.value;

  const [{ rows }, total] = await Promise.all([
    pool.query<{ used_bytes: string }>(
      `SELECT COALESCE(SUM(size_bytes), 0)::text AS used_bytes
         FROM files WHERE deleted_at IS NULL`,
    ),
    totalBytes(DATA_ROOT),
  ]);

  const used_bytes = Number(rows[0].used_bytes);
  const total_bytes = Number(total);
  const used_fraction = total_bytes > 0 ? used_bytes / total_bytes : 0;

  const value: StorageStats = { used_bytes, total_bytes, used_fraction };

  // Don't cache anomalous reads (e.g., transient mount issue returning 0 capacity).
  // A real prod incident with `df` returning 0 should self-heal in <60s rather than
  // being pinned by the cache.
  if (total_bytes > 0) {
    cache = { value, expires: now + TTL_MS };
  }
  return value;
}
```

Notes for the implementer:
- The test mocks now use `bigint` literals (`100n`, `4096n`) because `totalBytes` calls `statfs(dir, { bigint: true })`.
- The `_resetStorageStatsCache` export remains test-only by convention (leading underscore); no `NODE_ENV` gate.
- `Number(bigint)` is safe at VoreVault's scale (well under `Number.MAX_SAFE_INTEGER` / 2^53).

- [ ] **Step 4: Run tests — expect pass**

```bash
cd app && npx vitest run src/lib/storage-stats.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/storage-stats.ts app/src/lib/storage-stats.test.ts
git commit -m "feat(storage): add cached storage stats helper"
```

---

## Task 2: GET /api/storage/stats route

**Files:**
- Create: `app/src/app/api/storage/stats/route.ts`
- Test:   `app/src/app/api/storage/stats/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/src/app/api/storage/stats/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/storage-stats", () => ({ getStorageStats: vi.fn() }));

import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { getStorageStats } from "@/lib/storage-stats";

describe("GET /api/storage/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns stats when authenticated", async () => {
    (getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: "u1" });
    (getStorageStats as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      used_bytes: 100, total_bytes: 1000, used_fraction: 0.1,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ used_bytes: 100, total_bytes: 1000, used_fraction: 0.1 });
  });
});
```

- [ ] **Step 2: Run test — expect fail (no route file)**

```bash
cd app && npx vitest run src/app/api/storage/stats/route.test.ts
```

- [ ] **Step 3: Implement**

```ts
// app/src/app/api/storage/stats/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStorageStats } from "@/lib/storage-stats";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const stats = await getStorageStats();
  return NextResponse.json(stats);
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/app/api/storage/stats/
git commit -m "feat(api): GET /api/storage/stats"
```

---

## Task 3: StorageBar component

**Files:**
- Create: `app/src/components/StorageBar.tsx`, `StorageBar.module.css`, `StorageBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/StorageBar.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StorageBar } from "./StorageBar";

const ORIG_FETCH = global.fetch;

describe("StorageBar", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ used_bytes: 3_000_000_000, total_bytes: 11_000_000_000_000, used_fraction: 0.000273 }),
    });
  });
  afterEach(() => { global.fetch = ORIG_FETCH; });

  it("renders the formatted usage string after fetch", async () => {
    render(<StorageBar />);
    await waitFor(() => {
      expect(screen.getByText(/2\.8 GB of 11 TB/)).toBeInTheDocument();
    });
  });

  it("re-fetches on vorevault:upload-done event", async () => {
    render(<StorageBar />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new CustomEvent("vorevault:upload-done"));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});
```

Note: the project's tests use `@testing-library/react` if installed. If not, this task includes adding it: `cd app && npm install -D @testing-library/react @testing-library/jest-dom jsdom` and configuring `vitest.config.ts` with `environment: 'jsdom'`. Check `vitest.config.ts` first — if `environment: 'jsdom'` is already set and the libraries are installed, skip the install step.

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**

```tsx
// app/src/components/StorageBar.tsx
"use client";

import { useEffect, useState } from "react";
import styles from "./StorageBar.module.css";

type Stats = { used_bytes: number; total_bytes: number; used_fraction: number };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 4).toFixed(1)} TB`;
}

export function StorageBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/storage/stats");
        if (!res.ok) return;
        const data: Stats = await res.json();
        if (!cancelled) setStats(data);
      } catch { /* swallow; bar stays in skeleton */ }
    }
    void load();
    function onUploadDone() { void load(); }
    window.addEventListener("vorevault:upload-done", onUploadDone);
    return () => {
      cancelled = true;
      window.removeEventListener("vorevault:upload-done", onUploadDone);
    };
  }, []);

  if (!stats) {
    return <div className={styles.wrap} aria-label="storage usage" />;
  }

  const pct = Math.max(0.005, Math.min(1, stats.used_fraction));
  return (
    <div className={styles.wrap} aria-label="storage usage">
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className={`vv-meta ${styles.label}`}>
        <strong>{formatBytes(stats.used_bytes)}</strong> of <strong>{formatBytes(stats.total_bytes)}</strong>
      </div>
    </div>
  );
}
```

```css
/* app/src/components/StorageBar.module.css */
.wrap { padding: 12px 16px; min-height: 48px; }
.track {
  height: 6px;
  background: var(--vv-cream-dark);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 6px;
}
.fill {
  height: 100%;
  background: var(--vv-ink);
  transition: width 240ms ease-out;
}
.label { font-size: 11px; }
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/components/StorageBar.*
git commit -m "feat(ui): StorageBar with auto-refresh on upload-done event"
```

---

## Task 4: VaultTree (server) + VaultTreeView (client)

**Files:**
- Create: `app/src/components/VaultTree.tsx` (server), `VaultTreeView.tsx` (client), `VaultTree.module.css`, `VaultTreeView.test.tsx`

- [ ] **Step 1: Write the failing test for VaultTreeView**

```tsx
// app/src/components/VaultTreeView.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VaultTreeView } from "./VaultTreeView";

const FIXTURE = [
  { id: "a", name: "stunts", parent_id: null },
  { id: "b", name: "raids",  parent_id: null },
  { id: "c", name: "epic",   parent_id: "a" },
  { id: "d", name: "deep",   parent_id: "c" },
];

describe("VaultTreeView", () => {
  it("renders top-level folders with collapse caret when they have children", () => {
    render(<VaultTreeView nodes={FIXTURE} />);
    expect(screen.getByText("stunts")).toBeInTheDocument();
    expect(screen.getByText("raids")).toBeInTheDocument();
    expect(screen.queryByText("epic")).not.toBeInTheDocument();
  });

  it("expands a node on caret click", () => {
    render(<VaultTreeView nodes={FIXTURE} />);
    fireEvent.click(screen.getByLabelText("expand stunts"));
    expect(screen.getByText("epic")).toBeInTheDocument();
    expect(screen.queryByText("deep")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("expand epic"));
    expect(screen.getByText("deep")).toBeInTheDocument();
  });

  it("renders folder names as links to /d/[id]", () => {
    render(<VaultTreeView nodes={FIXTURE} />);
    expect(screen.getByText("stunts").closest("a")).toHaveAttribute("href", "/d/a");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement VaultTreeView (client)**

```tsx
// app/src/components/VaultTreeView.tsx
"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import styles from "./VaultTree.module.css";

export type FolderNode = { id: string; name: string; parent_id: string | null };

export function VaultTreeView({ nodes }: { nodes: FolderNode[] }) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, FolderNode[]>();
    for (const n of nodes) {
      const k = n.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    for (const [, list] of map) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [nodes]);

  const roots = childrenByParent.get(null) ?? [];
  return (
    <ul className={styles.tree}>
      {roots.map((n) => (
        <TreeNode key={n.id} node={n} childrenByParent={childrenByParent} depth={0} />
      ))}
    </ul>
  );
}

function TreeNode({
  node, childrenByParent, depth,
}: {
  node: FolderNode;
  childrenByParent: Map<string | null, FolderNode[]>;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const kids = childrenByParent.get(node.id) ?? [];
  const hasKids = kids.length > 0;

  return (
    <li className={styles.node} style={{ paddingLeft: `${depth * 12}px` }}>
      <div className={styles.row}>
        {hasKids ? (
          <button
            type="button"
            className={styles.caret}
            aria-label={`${open ? "collapse" : "expand"} ${node.name}`}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className={styles.caretSpacer} />
        )}
        <Link href={`/d/${node.id}`} className={styles.link}>
          {node.name}
        </Link>
      </div>
      {open && hasKids && (
        <ul className={styles.tree}>
          {kids.map((k) => (
            <TreeNode key={k.id} node={k} childrenByParent={childrenByParent} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

```css
/* app/src/components/VaultTree.module.css */
.tree { list-style: none; margin: 0; padding: 0; }
.node { font-size: 13px; }
.row {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 4px;
}
.row:hover { background: var(--vv-cream-dark); }
.caret, .caretSpacer {
  display: inline-flex; width: 16px; height: 16px;
  align-items: center; justify-content: center;
  background: none; border: 0; cursor: pointer; color: var(--vv-ink-muted);
  font-size: 10px;
}
.caret:hover { color: var(--vv-ink); }
.link {
  flex: 1; color: var(--vv-ink); text-decoration: none;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.link:hover { text-decoration: underline; }
```

- [ ] **Step 4: Implement VaultTree (server)**

```tsx
// app/src/components/VaultTree.tsx
import { pool } from "@/lib/db";
import { VaultTreeView, type FolderNode } from "./VaultTreeView";

async function fetchAllFolders(): Promise<FolderNode[]> {
  const { rows } = await pool.query<FolderNode>(
    `SELECT id, name, parent_id FROM folders ORDER BY LOWER(name)`,
  );
  return rows;
}

export async function VaultTree() {
  const nodes = await fetchAllFolders();
  return <VaultTreeView nodes={nodes} />;
}
```

- [ ] **Step 5: Run tests — expect pass**

- [ ] **Step 6: Commit**

```bash
git add app/src/components/VaultTree*.tsx app/src/components/VaultTree.module.css app/src/components/VaultTreeView.test.tsx
git commit -m "feat(ui): VaultTree recursive folder navigator"
```

---

## Task 5: NewMenu component (Plan 1 scope: new folder + upload file)

**Files:**
- Create: `app/src/components/NewMenu.tsx`, `NewMenu.module.css`, `NewMenu.test.tsx`

In Plan 1 the menu has two items: **new folder** (opens existing `NewFolderDialog`) and **upload file** (links to `/upload`, the existing route — preserved for this plan and removed in Plan 3). Plan 3 replaces this component with the recursive-upload version that adds **upload folder** and removes the link to `/upload`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/NewMenu.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewMenu } from "./NewMenu";

describe("NewMenu", () => {
  it("renders the + new button closed by default", () => {
    render(<NewMenu currentFolderId={null} />);
    expect(screen.getByRole("button", { name: /\+ new/ })).toBeInTheDocument();
    expect(screen.queryByText("new folder")).not.toBeInTheDocument();
  });

  it("opens the menu on click and shows new-folder + upload-file", () => {
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    expect(screen.getByText("new folder")).toBeInTheDocument();
    expect(screen.getByText("upload file")).toBeInTheDocument();
  });

  it("upload file is a link to /upload", () => {
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    expect(screen.getByText("upload file").closest("a")).toHaveAttribute("href", "/upload");
  });
});
```

- [ ] **Step 2: Run test — expect fail**

- [ ] **Step 3: Implement**

```tsx
// app/src/components/NewMenu.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NewFolderDialog } from "./NewFolderDialog";
import styles from "./NewMenu.module.css";

export function NewMenu({ currentFolderId }: { currentFolderId: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
      >
        + new
      </button>
      {menuOpen && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => { setMenuOpen(false); setFolderDialogOpen(true); }}
          >
            new folder
          </button>
          <Link
            href="/upload"
            className={styles.item}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
          >
            upload file
          </Link>
        </div>
      )}
      {folderDialogOpen && (
        <NewFolderDialog
          parentId={currentFolderId}
          parentName={null}
          onClose={() => setFolderDialogOpen(false)}
        />
      )}
    </div>
  );
}
```

```css
/* app/src/components/NewMenu.module.css */
.wrap { position: relative; }
.trigger {
  display: block; width: 100%;
  padding: 10px 16px;
  background: var(--vv-ink);
  color: var(--vv-cream);
  border: 0; border-radius: 18px;
  font: 700 14px var(--vv-font-ui);
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--vv-cream-dark);
  text-align: center;
}
.trigger:hover { transform: translate(-1px, -1px); box-shadow: 4px 4px 0 var(--vv-cream-dark); }
.menu {
  position: absolute; top: calc(100% + 6px); left: 0;
  min-width: 180px; background: var(--vv-cream);
  border: 1.5px solid var(--vv-ink); border-radius: 8px;
  box-shadow: 3px 3px 0 var(--vv-ink);
  padding: 4px; z-index: 30;
}
.item {
  display: block; width: 100%;
  padding: 8px 12px;
  background: none; border: 0;
  text-align: left; text-decoration: none;
  color: var(--vv-ink); font: 600 13px var(--vv-font-ui);
  border-radius: 4px; cursor: pointer;
}
.item:hover { background: var(--vv-cream-dark); }
```

Note: this assumes `NewFolderDialog` accepts `onClose`. Verify at `app/src/components/NewFolderDialog.tsx` and adjust if its prop is named differently — match the existing signature.

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/components/NewMenu.*
git commit -m "feat(ui): NewMenu (Plan 1: new folder + upload file)"
```

---

## Task 6: Sidebar (server shell) + SidebarChrome (client provider for drawer state)

**Files:**
- Create: `app/src/components/Sidebar.tsx` (server), `SidebarChrome.tsx` (client), `Sidebar.module.css`

The sidebar is a server component that renders static nav structure. It composes the client `<NewMenu>`, the server `<VaultTree>`, and the client `<StorageBar>`. The drawer open/close state is owned by `SidebarChrome` — a client provider mounted in the shell layout that wraps both the sidebar element and the topbar's hamburger toggle.

- [ ] **Step 1: Implement SidebarChrome (drawer context provider)**

```tsx
// app/src/components/SidebarChrome.tsx
"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type Ctx = { open: boolean; toggle: () => void; close: () => void };
// Default is a no-op so consumers (e.g., TopBar) can render outside the provider
// without crashing — important during the migration in Tasks 11–13 where some
// pages still import TopBar before they move into (shell).
const SidebarContext = createContext<Ctx>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function SidebarChromeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function close() { setOpen(false); }
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarChrome(): Ctx {
  return useContext(SidebarContext);
}

export function SidebarBackdrop() {
  const { open, close } = useSidebarChrome();
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="close sidebar"
      onClick={close}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        border: 0, padding: 0, zIndex: 25,
      }}
    />
  );
}

export function SidebarOpenClass({ children }: { children: ReactNode }) {
  const { open } = useSidebarChrome();
  return <div data-sidebar-open={open ? "true" : "false"}>{children}</div>;
}
```

- [ ] **Step 2: Implement Sidebar (server)**

```tsx
// app/src/components/Sidebar.tsx
import Link from "next/link";
import { NewMenu } from "./NewMenu";
import { VaultTree } from "./VaultTree";
import { StorageBar } from "./StorageBar";
import styles from "./Sidebar.module.css";

export function Sidebar({
  isAdmin,
  currentFolderId,
}: {
  isAdmin: boolean;
  currentFolderId: string | null;
}) {
  return (
    <aside className={styles.sidebar} aria-label="primary navigation">
      <div className={styles.newWrap}>
        <NewMenu currentFolderId={currentFolderId} />
      </div>

      <nav className={styles.nav}>
        <Link href="/" className={styles.navItem}>home</Link>
        <Link href="/recent" className={styles.navItem}>recent</Link>
        <Link href="/starred" className={styles.navItem}>starred</Link>
        <Link href="/mine" className={styles.navItem}>my uploads</Link>
      </nav>

      <div className={styles.sectionLabel}>vault</div>
      <div className={styles.tree}>
        <VaultTree />
      </div>

      {isAdmin && (
        <nav className={styles.nav}>
          <Link href="/admin" className={styles.navItem}>admin</Link>
        </nav>
      )}

      <div className={styles.spacer} />
      <StorageBar />
    </aside>
  );
}
```

```css
/* app/src/components/Sidebar.module.css */
.sidebar {
  width: 240px;
  height: 100vh;
  position: sticky; top: 0;
  background: var(--vv-cream);
  border-right: 1.5px solid var(--vv-ink);
  display: flex; flex-direction: column;
  padding: 14px 12px 0;
  overflow-y: auto;
}
.newWrap { padding: 0 4px 14px; }
.nav { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.navItem {
  display: block; padding: 8px 12px;
  font: 600 13px var(--vv-font-ui);
  color: var(--vv-ink); text-decoration: none;
  border-radius: 4px;
}
.navItem:hover { background: var(--vv-cream-dark); }
.sectionLabel {
  font: italic 700 12px var(--vv-font-display);
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--vv-ink-muted);
  padding: 14px 12px 6px;
}
.tree { padding: 0 4px 14px; }
.spacer { flex: 1; }

/* Mobile: hidden by default; opened via SidebarChrome */
@media (max-width: 768px) {
  .sidebar {
    position: fixed; left: 0; top: 0;
    transform: translateX(-100%);
    transition: transform 200ms ease-out;
    z-index: 30;
    box-shadow: 4px 0 0 var(--vv-cream-dark);
  }
  [data-sidebar-open="true"] .sidebar {
    transform: translateX(0);
  }
}
```

The CSS selector `[data-sidebar-open="true"] .sidebar` relies on `<SidebarOpenClass>` wrapping the sidebar in the layout — see Task 9.

- [ ] **Step 3: Commit (no tests yet — composes tested children)**

```bash
git add app/src/components/Sidebar* app/src/components/SidebarChrome.tsx
git commit -m "feat(ui): Sidebar shell + drawer state provider"
```

---

## Task 7: Refactor TopBar (drop upload pill, add hamburger toggle)

**Files:**
- Modify: `app/src/components/TopBar.tsx`, `TopBar.module.css`

- [ ] **Step 1: Apply the refactor**

Replace the existing `TopBar.tsx` with:

```tsx
// app/src/components/TopBar.tsx
"use client";

import { useEffect, useState } from "react";
import { MooseLogo } from "./MooseLogo";
import { UserChip } from "./UserChip";
import { SearchBar } from "./SearchBar";
import { useSidebarChrome } from "./SidebarChrome";
import styles from "./TopBar.module.css";

export function TopBar({
  username,
  avatarUrl,
  isAdmin = false,
}: {
  username: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { toggle: toggleSidebar } = useSidebarChrome();

  useEffect(() => {
    if (!mobileSearchOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMobileSearchOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileSearchOpen]);

  return (
    <>
      <header className={styles.topbar}>
        <button
          type="button"
          className={styles.hamburger}
          aria-label="open sidebar"
          onClick={toggleSidebar}
        >
          <span /><span /><span />
        </button>
        <a className={styles.brand} href="/">
          <MooseLogo size="header" />
          vorevault
        </a>
        <div className={styles.searchDesktop}>
          <SearchBar variant="inline" />
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.searchIconBtn}
            aria-label="open search"
            onClick={() => setMobileSearchOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
          <UserChip username={username} avatarUrl={avatarUrl} isAdmin={isAdmin} />
        </div>
      </header>

      {mobileSearchOpen && (
        <div className={styles.searchOverlay} role="dialog" aria-modal="true" aria-label="search">
          <div className={styles.searchOverlayHeader}>
            <button
              type="button"
              className={styles.searchOverlayClose}
              aria-label="close search"
              onClick={() => setMobileSearchOpen(false)}
            >
              ×
            </button>
            <SearchBar variant="overlay" autoFocus onHitSelected={() => setMobileSearchOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
```

Add hamburger styles to `TopBar.module.css`:

```css
/* Append to app/src/components/TopBar.module.css */
.hamburger {
  display: none;
  background: none; border: 0; padding: 8px;
  cursor: pointer;
}
.hamburger span {
  display: block;
  width: 18px; height: 2px;
  background: var(--vv-ink);
  margin: 4px 0;
  border-radius: 1px;
}
@media (max-width: 768px) {
  .hamburger { display: inline-flex; flex-direction: column; }
}
```

Also remove from `TopBar.module.css` any rules that targeted the deleted `.uploadPill`, `.uploadIcon`, `.uploadLabel` selectors. Use Grep on the file first:

```bash
grep -n "uploadPill\|uploadIcon\|uploadLabel" app/src/components/TopBar.module.css
```

Delete each matching block.

- [ ] **Step 2: Verify by build + smoke test**

```bash
cd app && npx tsc --noEmit
```
Expected: clean. The `useSidebarChrome` hook will throw at runtime if used outside the provider, which is fine because the provider is added in Task 9 before any page mounts the new TopBar.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/TopBar.tsx app/src/components/TopBar.module.css
git commit -m "refactor(ui): TopBar drops upload pill, adds hamburger toggle"
```

---

## Task 8: Refactor UserChip (drop admin link)

**Files:**
- Modify: `app/src/components/UserChip.tsx`

- [ ] **Step 1: Remove the admin link from the menu**

In `app/src/components/UserChip.tsx`, delete the lines:

```tsx
{isAdmin && (
  <a className={styles.item} href="/admin" role="menuitem">
    Admin
  </a>
)}
```

The `isAdmin` prop is still passed in (used by callers and possibly tests); keep it in the type signature even though it's no longer rendered, since the sidebar still receives it from the same source. Drop the conditional render only.

Also drop the obsolete menu items that are now sidebar destinations:

```tsx
<a className={styles.item} href="/?mine=1" role="menuitem">↑ My uploads</a>
<a className={styles.item} href="/saved" role="menuitem">Saved</a>
```

The remaining menu should contain the username header, divider, and Log out form only.

- [ ] **Step 2: Build + commit**

```bash
cd app && npx tsc --noEmit
git add app/src/components/UserChip.tsx
git commit -m "refactor(ui): UserChip drops admin/mine/saved (now in sidebar)"
```

---

## Task 9: Create (shell) route group with layout

**Files:**
- Create: `app/src/app/(shell)/layout.tsx`

This layout receives every page inside the route group. It performs auth, derives `currentFolderId` from the URL when the page is `/d/[id]`, mounts the `SidebarChromeProvider`, and renders `TopBar`, `Sidebar`, and the page content.

- [ ] **Step 1: Implement**

```tsx
// app/src/app/(shell)/layout.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { SidebarChromeProvider, SidebarBackdrop, SidebarOpenClass } from "@/components/SidebarChrome";
import styles from "./shell.module.css";

export const dynamic = "force-dynamic";

async function deriveCurrentFolderId(): Promise<string | null> {
  // Request URL detection — used to scope NewMenu's "new folder" parent.
  // headers() exposes x-pathname when set by middleware; we add it in Task 11.
  const h = await headers();
  const pathname = h.get("x-vv-pathname") ?? "";
  const match = pathname.match(/^\/d\/([^/]+)/);
  return match ? match[1] : null;
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const currentFolderId = await deriveCurrentFolderId();

  return (
    <SidebarChromeProvider>
      <SidebarOpenClass>
        <div className={styles.shell}>
          <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
          <div className={styles.body}>
            <Sidebar isAdmin={user.is_admin} currentFolderId={currentFolderId} />
            <main className={styles.main}>{children}</main>
          </div>
          <SidebarBackdrop />
        </div>
      </SidebarOpenClass>
    </SidebarChromeProvider>
  );
}
```

```css
/* app/src/app/(shell)/shell.module.css */
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.body { display: flex; flex: 1; min-height: 0; }
.main { flex: 1; min-width: 0; }
```

- [ ] **Step 2: Commit**

```bash
git add "app/src/app/(shell)/layout.tsx" "app/src/app/(shell)/shell.module.css"
git commit -m "feat(ui): (shell) route group with sidebar layout"
```

---

## Task 10: Inject pathname into request headers (for layout-side derivation)

**Files:**
- Modify: `app/src/middleware.ts`

The shell layout needs the current pathname (server component, no `usePathname` available). Inject it via a request header from middleware.

- [ ] **Step 1: Edit middleware to add `x-vv-pathname`**

Replace `app/src/middleware.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/hooks", "/files", "/p", "/api/public"];
const SESSION_COOKIE = "vv_session";

function withPathname(req: NextRequest, res: NextResponse): NextResponse {
  res.headers.set("x-vv-pathname", req.nextUrl.pathname);
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /saved → /starred (Task 16): legacy redirect, preserve subpaths and query.
  if (pathname === "/saved" || pathname.startsWith("/saved/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace(/^\/saved/, "/starred");
    return NextResponse.redirect(url, 308);
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return withPathname(req, NextResponse.next());
  }
  if (req.cookies.get(SESSION_COOKIE)?.value) {
    const next = NextResponse.next();
    next.headers.set("x-vv-pathname", pathname);
    next.headers.set("x-middleware-request-x-vv-pathname", pathname);
    return next;
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

The header `x-middleware-request-x-vv-pathname` is the way Next 15 surfaces a request header to the downstream React tree (the plain `x-vv-pathname` set on `NextResponse` is for the response only). If you find `headers().get("x-vv-pathname")` returns null in the layout, switch the layout to use `request.headers` via the alternative pattern: a `<PathnameProvider>` client component reading `usePathname()` and exposing it via context. That's the fallback if the middleware header injection misbehaves on this Next version.

- [ ] **Step 2: Commit**

```bash
git add app/src/middleware.ts
git commit -m "feat(middleware): inject x-vv-pathname; add /saved → /starred 308"
```

---

## Task 11: Move home page into (shell)

**Files:**
- Move: `app/src/app/page.tsx` → `app/src/app/(shell)/page.tsx`
- Move: `app/src/app/page.module.css` → `app/src/app/(shell)/page.module.css`

The original `app/page.tsx` rendered its own `<TopBar>` — that's now in the layout, so remove it from the page. Pagination, folders, and the recent grid stay; the home restructure (recent strip + offset main grid) lands in Task 17.

- [ ] **Step 1: Move and edit**

```bash
git mv app/src/app/page.tsx app/src/app/\(shell\)/page.tsx
git mv app/src/app/page.module.css app/src/app/\(shell\)/page.module.css
```

Edit `app/src/app/(shell)/page.tsx`: delete the `import { TopBar }` line and the `<TopBar ... />` render. The page should start with `<>` (or `<main>`) wrapping the existing subheader/folders/grid markup. `dynamic = "force-dynamic"` stays.

- [ ] **Step 2: Build + smoke test (root URL)**

```bash
cd app && npx tsc --noEmit && npx next build
```

Visit `/` once the dev server is up — confirm shell layout wraps the home page.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move home page into (shell) route group"
```

---

## Task 12: Move /d/[id], /f/[id], /search, /admin, /upload into (shell)

**Files:** mechanical moves.

- [ ] **Step 1: Move directories**

```bash
git mv app/src/app/d app/src/app/\(shell\)/d
git mv app/src/app/f app/src/app/\(shell\)/f
git mv app/src/app/search app/src/app/\(shell\)/search
git mv app/src/app/admin app/src/app/\(shell\)/admin
git mv app/src/app/upload app/src/app/\(shell\)/upload
```

- [ ] **Step 2: Strip TopBar usage from moved pages**

For each moved `page.tsx`, remove `import { TopBar }` and `<TopBar ... />` if present. The shell layout owns the topbar now. Use Grep first:

```bash
grep -rln "import { TopBar }\|<TopBar" "app/src/app/(shell)/"
```

Edit each file the grep finds; remove the import line and the JSX render.

Also confirm no page **outside** `(shell)` still imports TopBar — `/login` and `/p/[token]` are the public routes; check them:

```bash
grep -rln "TopBar" app/src/app/login app/src/app/p
```
Expected: no matches. (TopBar is now provider-aware so it would no-op the hamburger anyway, but it's cleaner to keep it out of public surfaces.)

- [ ] **Step 3: Run the test suite**

```bash
cd app && npm test
```
Expected: pass. If any test imports a moved file by absolute path, fix the import.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move authed pages into (shell), drop per-page TopBar"
```

---

## Task 13: Rename /saved → /starred (move into (shell))

**Files:**
- Move: `app/src/app/saved/` → `app/src/app/(shell)/starred/`

The /saved → /starred 308 redirect was added to middleware in Task 10, so external links keep working.

- [ ] **Step 1: Move and rename**

```bash
git mv app/src/app/saved app/src/app/\(shell\)/starred
```

If the moved directory contains any `<h1>` or labels reading "saved", change them to "starred". Strip `<TopBar>` usage if present (same pattern as Task 12).

- [ ] **Step 2: Build + commit**

```bash
cd app && npx tsc --noEmit
git add -A
git commit -m "refactor: rename /saved to /starred (308 redirect in middleware)"
```

---

## Task 14: Add /recent and /mine pages

**Files:**
- Create: `app/src/app/(shell)/recent/page.tsx`, `recent/page.module.css`
- Create: `app/src/app/(shell)/mine/page.tsx`, `mine/page.module.css`

Both pages reuse `listFiles` and the same paginated grid layout as home's "all clips" section.

- [ ] **Step 1: Implement /recent**

```tsx
// app/src/app/(shell)/recent/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { FileCard } from "@/components/FileCard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function RecentPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listFiles(page, limit);
  const totalPages = Math.ceil(data.total / limit);

  return (
    <main className={styles.main}>
      <h1 className="vv-greeting">recent uploads</h1>
      <div className={styles.grid}>
        {data.files.map((f) => <FileCard key={f.id} file={f} />)}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 && <a href={`/recent?page=${page - 1}`}>← prev</a>}
          <span>page {page} of {totalPages}</span>
          {page < totalPages && <a href={`/recent?page=${page + 1}`}>next →</a>}
        </div>
      )}
    </main>
  );
}
```

```css
/* app/src/app/(shell)/recent/page.module.css */
.main { max-width: 1200px; margin: 0 auto; padding: 0; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
  padding: 20px 32px 32px;
}
.pagination {
  display: flex; justify-content: center; gap: 20px;
  padding: 0 32px 48px; color: var(--vv-ink-muted); font-style: italic;
}
.pagination a { color: var(--vv-accent); font-weight: 700; font-style: normal; }
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; gap: 16px; padding: 16px; }
}
```

- [ ] **Step 2: Implement /mine (identical except passes uploaderId)**

```tsx
// app/src/app/(shell)/mine/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles } from "@/lib/files";
import { FileCard } from "@/components/FileCard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function MinePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const data = await listFiles(page, limit, user.id);
  const totalPages = Math.ceil(data.total / limit);

  return (
    <main className={styles.main}>
      <h1 className="vv-greeting">your uploads</h1>
      <div className={styles.grid}>
        {data.files.map((f) => <FileCard key={f.id} file={f} />)}
      </div>
      {totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 && <a href={`/mine?page=${page - 1}`}>← prev</a>}
          <span>page {page} of {totalPages}</span>
          {page < totalPages && <a href={`/mine?page=${page + 1}`}>next →</a>}
        </div>
      )}
    </main>
  );
}
```

`mine/page.module.css` is identical to `recent/page.module.css`.

- [ ] **Step 3: Commit**

```bash
git add "app/src/app/(shell)/recent" "app/src/app/(shell)/mine"
git commit -m "feat(routes): add /recent and /mine pages"
```

---

## Task 15: Extend listFiles with offset, add listRecentFiles helper

**Files:**
- Modify: `app/src/lib/files.ts`
- Modify: `app/src/lib/files.test.ts`

Home's "all clips" grid must skip the 6 items shown in the recent strip. Add an optional `extraOffset` parameter to `listFiles` and a `listRecentFiles(limit)` helper for the strip.

- [ ] **Step 1: Write failing tests**

Add to `app/src/lib/files.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("@/lib/db", () => ({ pool: { query: vi.fn() } }));
import { pool } from "@/lib/db";
import { listFiles, listRecentFiles } from "./files";

describe("listFiles offset", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds extraOffset to the OFFSET in the SQL params", async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] })  // dataRes
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }); // countRes

    await listFiles(1, 24, undefined, 6);
    const dataCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(dataCall[1]).toEqual([24, 6]);  // limit=24, offset = (1-1)*24 + 6 = 6
  });

  it("subtracts extraOffset from total in the returned page", async () => {
    (pool.query as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "30" }] });
    const page = await listFiles(1, 24, undefined, 6);
    expect(page.total).toBe(24);  // 30 - 6 (the strip's items)
  });
});

describe("listRecentFiles", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns up to N most-recent non-deleted files", async () => {
    (pool.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ id: "1" }, { id: "2" }],
    });
    const rows = await listRecentFiles(6);
    expect(rows).toHaveLength(2);
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toMatch(/ORDER BY f\.created_at DESC/);
    expect(sql).toMatch(/LIMIT \$1/);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

- [ ] **Step 3: Implement**

In `app/src/lib/files.ts`, change `listFiles`:

```ts
export async function listFiles(
  page: number,
  limit: number,
  uploaderId?: string,
  extraOffset: number = 0,
): Promise<FilePage> {
  const offset = (page - 1) * limit + extraOffset;
  // existing query body unchanged, just uses the new offset value
  // ...
  return {
    files: dataRes.rows,
    total: Math.max(0, parseInt(countRes.rows[0].count, 10) - extraOffset),
    page,
    limit,
  };
}
```

Add at the bottom of `app/src/lib/files.ts`:

```ts
export async function listRecentFiles(limit: number): Promise<FileWithUploader[]> {
  const { rows } = await pool.query<FileWithUploader>(
    `SELECT f.*, u.username AS uploader_name
     FROM files f JOIN users u ON u.id = f.uploader_id
     WHERE f.deleted_at IS NULL
     ORDER BY f.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
```

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/files.ts app/src/lib/files.test.ts
git commit -m "feat(lib): listFiles offset arg + listRecentFiles helper"
```

---

## Task 16: RecentStrip component

**Files:**
- Create: `app/src/components/RecentStrip.tsx`, `RecentStrip.module.css`

Compact horizontal strip of 6 thumbnails with a "view all" link to `/recent`. Reuses `FileCard` is overkill (FileCard is full-card); a simple thumbnail link is enough.

- [ ] **Step 1: Implement**

```tsx
// app/src/components/RecentStrip.tsx
import Link from "next/link";
import type { FileWithUploader } from "@/lib/files";
import styles from "./RecentStrip.module.css";

export function RecentStrip({ files }: { files: FileWithUploader[] }) {
  if (files.length === 0) return null;
  return (
    <section className={styles.section} aria-label="recent uploads">
      <div className={styles.header}>
        <h2 className="vv-section-label">recent</h2>
        <Link href="/recent" className={styles.viewAll}>view all</Link>
      </div>
      <div className={styles.strip}>
        {files.map((f) => (
          <Link key={f.id} href={`/f/${f.id}`} className={styles.tile}>
            {f.thumbnail_path ? (
              <img src={`/thumbs/${f.id}`} alt={f.original_name} loading="lazy" />
            ) : (
              <div className={styles.tilePlaceholder} aria-hidden="true">{f.original_name.slice(0, 1)}</div>
            )}
            <div className={styles.tileLabel} title={f.original_name}>{f.original_name}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

```css
/* app/src/components/RecentStrip.module.css */
.section { padding: 0 32px; margin-bottom: 24px; }
.header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.viewAll { color: var(--vv-accent); font: 600 13px var(--vv-font-ui); text-decoration: none; }
.viewAll:hover { text-decoration: underline; }
.strip {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.tile {
  display: flex; flex-direction: column;
  text-decoration: none; color: var(--vv-ink);
  border-radius: 6px; overflow: hidden;
  background: var(--vv-cream-dark);
}
.tile img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.tilePlaceholder {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  background: var(--vv-cream-dark); color: var(--vv-ink-muted);
  font: italic 700 24px var(--vv-font-display);
}
.tileLabel {
  font: 600 11px var(--vv-font-ui); padding: 6px 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
@media (max-width: 768px) { .strip { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 480px) { .strip { grid-template-columns: repeat(2, 1fr); } }
```

Verify the thumbnail URL pattern: check what `app/src/app/thumbs/` (or wherever thumbnails are served) actually expects. Use Grep to find the thumbnail URL pattern used in `FileCard.tsx` and match it exactly. If it's `/api/thumbs/${id}` or similar, adjust the `src` above.

- [ ] **Step 2: Commit**

```bash
git add app/src/components/RecentStrip.*
git commit -m "feat(ui): RecentStrip — 6-thumbnail recent uploads strip"
```

---

## Task 17: Restructure home page (recent strip + folders + offset all-clips grid)

**Files:**
- Modify: `app/src/app/(shell)/page.tsx`

Remove the `mine` flag (now its own page). New section order: greeting → meta → RecentStrip(6) → folders → all clips (offset by 6 to avoid duplication).

- [ ] **Step 1: Replace the page body**

```tsx
// app/src/app/(shell)/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFiles, listRecentFiles } from "@/lib/files";
import { listTopLevelFolders } from "@/lib/folders";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { NewFolderButton } from "@/components/NewFolderButton";
import { RecentStrip } from "@/components/RecentStrip";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const RECENT_STRIP_COUNT = 6;

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const ago = Date.now() - date.getTime();
  const min = Math.floor(ago / 60000);
  if (min < 60) return `${Math.max(1, min)}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;

  const [recent, folders, data] = await Promise.all([
    listRecentFiles(RECENT_STRIP_COUNT),
    listTopLevelFolders(),
    listFiles(page, limit, undefined, RECENT_STRIP_COUNT),
  ]);

  const lastUpload = recent[0]?.created_at ?? null;
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">welcome back, <strong>{user.username}</strong>.</h1>
        {recent.length > 0 && (
          <div className="vv-meta">
            <strong>{recent.length + data.total}</strong> clips · last upload <strong>{relativeTime(lastUpload)}</strong>
          </div>
        )}
      </div>

      <RecentStrip files={recent} />

      <section className={styles.foldersSection}>
        <div className={styles.foldersHeader}>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>folders</h2>
          <NewFolderButton parentId={null} parentName={null} />
        </div>
        {folders.length === 0 ? (
          <p className={styles.foldersEmpty}>no folders yet. create one with the + new folder button above.</p>
        ) : (
          <div className={styles.folderGrid}>
            {folders.map((f) => (
              <FolderTile key={f.id} id={f.id} name={f.name}
                fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count} />
            ))}
          </div>
        )}
      </section>

      {data.files.length > 0 ? (
        <>
          <h2 className={`vv-section-label ${styles.sectionLabel}`}>all clips</h2>
          <div className={styles.grid}>
            {data.files.map((f) => <FileCard key={f.id} file={f} />)}
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 && <a href={`/?page=${page - 1}`}>← prev</a>}
              <span>page {page} of {totalPages}</span>
              {page < totalPages && <a href={`/?page=${page + 1}`}>next →</a>}
            </div>
          )}
        </>
      ) : recent.length === 0 ? (
        <div className={styles.empty}>
          <h2 className="vv-title">drop the first clip in the vault.</h2>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Build + test**

```bash
cd app && npx tsc --noEmit && npm test
```

- [ ] **Step 3: Commit**

```bash
git add "app/src/app/(shell)/page.tsx"
git commit -m "feat(home): recent strip + folders + offset all-clips grid"
```

---

## Task 18: Mobile FAB

**Files:**
- Create: `app/src/components/MobileFAB.tsx`, `MobileFAB.module.css`

In Plan 1 the FAB is a `<Link href="/upload">` (matches NewMenu's "upload file" item). Plan 3 will switch it to open the same NewMenu modal as the sidebar `+ new`.

- [ ] **Step 1: Implement**

```tsx
// app/src/components/MobileFAB.tsx
"use client";

import Link from "next/link";
import styles from "./MobileFAB.module.css";

export function MobileFAB() {
  return (
    <Link href="/upload" className={styles.fab} aria-label="upload">
      +
    </Link>
  );
}
```

```css
/* app/src/components/MobileFAB.module.css */
.fab {
  display: none;
  position: fixed; bottom: 24px; right: 24px;
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--vv-ink);
  color: var(--vv-cream);
  font: 700 28px var(--vv-font-ui);
  align-items: center; justify-content: center;
  text-decoration: none;
  box-shadow: 4px 4px 0 var(--vv-cream-dark);
  z-index: 25;
}
@media (max-width: 768px) { .fab { display: inline-flex; } }
```

- [ ] **Step 2: Mount in shell layout**

Edit `app/src/app/(shell)/layout.tsx` to render `<MobileFAB />` once, inside the shell:

```tsx
import { MobileFAB } from "@/components/MobileFAB";
// ...
<SidebarBackdrop />
<MobileFAB />
```

- [ ] **Step 3: Commit**

```bash
git add app/src/components/MobileFAB.* "app/src/app/(shell)/layout.tsx"
git commit -m "feat(ui): mobile FAB linking to /upload (Plan 1 stub)"
```

---

## Task 19: Drop the now-broken `?mine=1` handling site-wide

**Files:**
- Grep + audit

`/?mine=1` no longer renders mine-filtered content (Task 17 removed that branch). Anywhere that links to it should link to `/mine` instead.

- [ ] **Step 1: Find references**

```bash
grep -rn "mine=1\|/?mine=1" app/src/
```

- [ ] **Step 2: Replace each occurrence**

For each match outside markdown/docs, change the href to `/mine`. The UserChip already had this link removed in Task 8; if anything else surfaces, fix it.

- [ ] **Step 3: Commit (if anything changed)**

```bash
git add -A
git commit -m "refactor: replace ?mine=1 with /mine route"
```

---

## Task 20: Build verification + test pass

- [ ] **Step 1: Full type check + test**

```bash
cd app && npx tsc --noEmit && npm test
```

- [ ] **Step 2: Build the docker image locally**

```bash
cd /root/vorevault && docker build -t vorevault-shell-check ./app
```

Expected: build succeeds. If `next build` complains about `headers()` use in the layout, switch the layout to read pathname via a client `<PathnameProvider>` per the fallback noted in Task 10.

- [ ] **Step 3: Commit a noop "verified" marker only if you needed to fix anything; otherwise skip.**

---

## Task 21: Manual smoke checklist (post-deploy, browser)

This task is not a code change — it's the verification list the human runs after merge & deploy.

- [ ] Sidebar renders with: + new, home, recent, starred, my uploads, vault tree, admin (if admin), storage bar.
- [ ] `+ new` opens menu; "new folder" opens the folder dialog with the right parent (root on `/`, current folder on `/d/[id]`); "upload file" navigates to `/upload`.
- [ ] Vault tree shows root folders and expands to children correctly.
- [ ] Home page shows: greeting → recent strip (6 thumbs) → folders → all clips. The all-clips grid does NOT duplicate the items in the strip.
- [ ] `/recent`, `/mine`, `/starred` all render and paginate.
- [ ] `/saved` and `/saved/anything` 308-redirect to `/starred*`.
- [ ] `/upload` still works (will be removed in Plan 3).
- [ ] Topbar has no upload pill; brand + search + user only.
- [ ] UserChip menu shows username + Log out only (no Admin/Mine/Saved items).
- [ ] Storage bar fetches and displays; bar is a tiny sliver (we only have ~3 GB on 11 TB).
- [ ] At ≤768px: hamburger toggle reveals sidebar drawer with backdrop. FAB appears bottom-right.
- [ ] FAB tap navigates to `/upload`.
- [ ] All design tokens look right (cream background, sticker shadows on +new and FAB only, no emoji).

---

## Out of scope for this plan (explicit)

- Trash sidebar item, `/trash` page, trash actions — **Plan 2**
- Recursive folder upload, `+ new` upload-folder option, bottom progress drawer, removal of `/upload` — **Plan 3**
- Per-user quotas — deferred indefinitely per spec
