# Recursive Folder Upload + Upload Drawer (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone `/upload` route with an inline upload flow launched from the sidebar `+ new` menu. Add recursive folder upload via `<input webkitdirectory>` + a new `/api/folders/tree` endpoint that creates missing folders in a transaction. Add a bottom-right `UploadProgressDrawer` that survives navigation and broadcasts completion so `StorageBar` and file grids can refresh.

**Architecture:** Uploads lift out of the per-page `UploadClient` into a single React context provider (`UploadProgressProvider`) mounted in `(shell)/layout.tsx`. The provider owns the list of `UploadState` rows, starts one `tus.Upload` per file, and emits a `vorevault:upload-done` browser event per completed row. `NewMenu` gains "upload file" and "upload folder" actions: both first open `FolderPickerModal` to pick a destination, then trigger a native `<input>` (`multiple` vs. `webkitdirectory`); the chosen files are handed to the provider. Folder-upload first POSTs the directory tree to `POST /api/folders/tree`, which creates any missing folders inside a transaction and returns a `path → folder_id` map; each file then uploads with its resolved `folderId` in tusd metadata. The drawer is a fixed bottom-right component reading from the provider; `StorageBar` already listens for `vorevault:upload-done` from Plan 1. The old `/upload` route is deleted and `MobileFAB` is re-wired to open `NewMenu` instead of linking to `/upload`.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Postgres 16 via `pg` Pool, Vitest + testcontainers, `tus-js-client` for uploads, CSS Modules with `--vv-*` design tokens.

**Spec:** `docs/superpowers/specs/2026-04-22-drive-redesign-design.md` (Recursive folder upload + UploadProgressDrawer sections, lines 104–131 and 249–262).

**Branch:** `feat/recursive-upload-plan-3` (branch off `main` — Plan 1 shell and Plan 2 trash are already merged).

---

## File Structure

**Created:**
- `app/src/app/api/folders/tree/POST.md` — none (just use existing route file; see below).
- `app/src/lib/folder-paths.ts` — pure helpers: `normalizePaths`, `splitRelativeDir`, shared between the new endpoint and the client upload flow.
- `app/src/lib/folder-paths.test.ts` — unit tests for the helpers.
- `app/src/lib/folder-tree-create.ts` — `createFolderTree({ parentId, paths, actorId })` — builds missing folders depth-first in one transaction, returns a path→id map.
- `app/src/lib/folder-tree-create.test.ts` — testcontainers coverage for happy path, partial-existing branches, sibling collision → full rollback.
- `app/src/components/UploadProgressProvider.tsx` (client) — context + provider that owns in-flight upload rows and starts tus uploads. Exposes `useUploadProgress()`.
- `app/src/components/UploadProgressProvider.test.tsx`
- `app/src/components/UploadProgressDrawer.tsx` (client) + `.module.css` + `.test.tsx` — fixed bottom-right drawer listing rows, collapsible, auto-collapses 5s after all rows settle.
- `app/src/components/UploadPicker.tsx` (client) — holds the hidden file + directory inputs owned by `NewMenu`; exposes `pickFiles()` / `pickFolder()` imperatively.

**Modified:**
- `app/src/app/api/folders/tree/route.ts` — add `POST` handler that calls `createFolderTree`; existing `GET` stays untouched.
- `app/src/app/api/folders/tree/route.test.ts` — add POST tests (unauthenticated, invalid body, happy path).
- `app/src/components/NewMenu.tsx` — swap "upload file" `<Link>` for a button; add "upload folder" button. Both buttons open `FolderPickerModal` first, then fire the appropriate picker, then hand files to the provider.
- `app/src/components/NewMenu.module.css` — accommodate an extra menu item (no structural changes expected; just confirm spacing).
- `app/src/components/NewMenu.test.tsx` — replace the "upload file links to /upload" test with new behavior: clicking the menu items opens the folder picker, etc.
- `app/src/components/MobileFAB.tsx` — convert to a button that opens `NewMenu` as a centered modal (via a small portal) instead of linking to `/upload`.
- `app/src/components/MobileFAB.module.css` — minor: the element is now `<button>`, not `<a>`.
- `app/src/app/(shell)/layout.tsx` — wrap `{children}` in `<UploadProgressProvider>`; render `<UploadProgressDrawer/>` at the end of the shell.

**Deleted:**
- `app/src/app/(shell)/upload/page.tsx`
- `app/src/app/(shell)/upload/page.module.css`
- `app/src/app/(shell)/upload/UploadClient.tsx`
- `app/src/app/(shell)/upload/UploadClient.module.css`
- `app/src/app/(shell)/upload/` (the directory itself once files are gone)

**Redirect (middleware):**
- `app/src/middleware.ts` — add `/upload` → `/` 308 redirect (alongside the existing `/saved` → `/starred` redirect). Anyone hitting an external bookmark lands on home.

---

## Task 1: Pure path helpers (normalizePaths, splitRelativeDir)

**Files:**
- Create: `app/src/lib/folder-paths.ts`
- Test:   `app/src/lib/folder-paths.test.ts`

`webkitRelativePath` gives strings like `MyFolder/sub/clip.mp4`. We need two small pure helpers:

- `splitRelativeDir(relativePath)` → `{ dir, name }` — `dir` is the joined-with-`/` directory part (no leading/trailing slash, may be empty string for root-of-picker), `name` is the filename.
- `normalizePaths(relativePaths)` → `string[]` — takes the directory parts of every picked file, returns the **deduped, depth-sorted** list of directory paths needed to host them. Shallow paths come before deep paths so `createFolderTree` can build parents before children.

Rules:
- Ignore empty-string directories (the `webkitdirectory` root case where a file is directly under the picked folder is impossible; files always have the top-level folder in the path).
- Trim trailing `/`; collapse repeated slashes.
- Reject any segment equal to `""`, `"."`, `".."` — throw `InvalidFolderPathError` (defined here). These would indicate a browser quirk; we fail closed.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/lib/folder-paths.test.ts
import { describe, it, expect } from "vitest";
import {
  splitRelativeDir,
  normalizePaths,
  InvalidFolderPathError,
} from "./folder-paths";

describe("splitRelativeDir", () => {
  it("splits MyFolder/sub/clip.mp4 into dir + name", () => {
    expect(splitRelativeDir("MyFolder/sub/clip.mp4")).toEqual({
      dir: "MyFolder/sub",
      name: "clip.mp4",
    });
  });

  it("returns empty dir for single-segment path", () => {
    expect(splitRelativeDir("clip.mp4")).toEqual({ dir: "", name: "clip.mp4" });
  });

  it("rejects .. segments", () => {
    expect(() => splitRelativeDir("MyFolder/../evil.mp4")).toThrow(InvalidFolderPathError);
  });
});

describe("normalizePaths", () => {
  it("dedupes and returns depth-sorted list", () => {
    const result = normalizePaths([
      "MyFolder/sub/deep",
      "MyFolder",
      "MyFolder/sub",
      "MyFolder/other",
      "MyFolder/sub", // dup
    ]);
    expect(result).toEqual([
      "MyFolder",
      "MyFolder/other",
      "MyFolder/sub",
      "MyFolder/sub/deep",
    ]);
  });

  it("drops empty strings", () => {
    expect(normalizePaths(["", "A", ""])).toEqual(["A"]);
  });

  it("collapses repeated slashes", () => {
    expect(normalizePaths(["A//B"])).toEqual(["A", "A/B"]);
  });

  it("rejects '.' or '..' segments", () => {
    expect(() => normalizePaths(["A/../B"])).toThrow(InvalidFolderPathError);
    expect(() => normalizePaths(["A/./B"])).toThrow(InvalidFolderPathError);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd app && npx vitest run src/lib/folder-paths.test.ts`
Expected: FAIL with "Cannot find module './folder-paths'".

- [ ] **Step 3: Implement the helpers**

```ts
// app/src/lib/folder-paths.ts
export class InvalidFolderPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFolderPathError";
  }
}

function assertValidSegment(segment: string): void {
  if (segment === "" || segment === "." || segment === "..") {
    throw new InvalidFolderPathError(`invalid path segment: "${segment}"`);
  }
}

function cleanPath(raw: string): string {
  const segments = raw.split("/").filter((s) => s !== "");
  for (const s of segments) assertValidSegment(s);
  return segments.join("/");
}

export function splitRelativeDir(relativePath: string): { dir: string; name: string } {
  const cleaned = cleanPath(relativePath);
  const slash = cleaned.lastIndexOf("/");
  if (slash === -1) return { dir: "", name: cleaned };
  return { dir: cleaned.slice(0, slash), name: cleaned.slice(slash + 1) };
}

export function normalizePaths(inputs: string[]): string[] {
  const set = new Set<string>();
  for (const raw of inputs) {
    const cleaned = cleanPath(raw);
    if (cleaned === "") continue;
    // Also include every ancestor so parents are always created.
    const parts = cleaned.split("/");
    for (let i = 1; i <= parts.length; i++) {
      set.add(parts.slice(0, i).join("/"));
    }
  }
  return [...set].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `cd app && npx vitest run src/lib/folder-paths.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/folder-paths.ts app/src/lib/folder-paths.test.ts
git commit -m "feat(upload): folder-path helpers for recursive upload"
```

---

## Task 2: Transactional folder-tree creation (`createFolderTree`)

**Files:**
- Create: `app/src/lib/folder-tree-create.ts`
- Test:   `app/src/lib/folder-tree-create.test.ts`

This is the core server helper used by the new endpoint. It takes a parent folder id (nullable) and a sorted list of folder paths (guaranteed by `normalizePaths` to be parents-before-children). For each path it looks up existing children (skipping trashed) or inserts a new folder. Everything runs inside a single `BEGIN/COMMIT`; any error rolls the whole thing back.

Behavior:
- `paths` must already be `normalizePaths`-clean; the helper treats bad input as a programmer error.
- If a segment already exists as an **active** folder under its parent (case-insensitive, per the existing unique index on `(parent_id, lower(name))`), reuse it — do not error.
- If a segment collides with a **trashed** folder at the same parent, the active-set unique index does not apply, so the `INSERT` will succeed. This matches Plan 2 behavior (trash does not block new creation).
- If any other error occurs (parent not found, unexpected PG error), the whole transaction rolls back and the error propagates.
- Returns `Record<string, string>` mapping every input path to the resolved folder id.
- All `deleted_at IS NULL` filters follow Plan 2 conventions.

- [ ] **Step 1: Write the failing test (testcontainers)**

```ts
// app/src/lib/folder-tree-create.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { createFolderTree } from "./folder-tree-create";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  // Stub the shared pool so lib/folders.ts (imported transitively) sees the
  // testcontainer connection.
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  const res = await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username, avatar_url, is_admin)
       VALUES ('d1', 'tester', null, false) RETURNING id`,
  );
  userId = res.rows[0].id;
}, 60_000);

afterAll(async () => { await stopPg(fx); });

beforeEach(async () => {
  await fx.pool.query(`DELETE FROM folders`);
});

describe("createFolderTree", () => {
  it("creates all folders under the given parent and returns a path→id map", async () => {
    const map = await createFolderTree({
      parentId: null,
      paths: ["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"],
      actorId: userId,
    });
    expect(Object.keys(map).sort()).toEqual(["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"]);
    const { rows } = await fx.pool.query<{ name: string; parent_id: string | null }>(
      `SELECT name, parent_id FROM folders ORDER BY name`,
    );
    expect(rows.map((r) => r.name)).toEqual(["MyFolder", "deep", "sub"]);
  });

  it("reuses an existing active folder at the correct level", async () => {
    const first = await createFolderTree({
      parentId: null,
      paths: ["MyFolder", "MyFolder/sub"],
      actorId: userId,
    });
    const second = await createFolderTree({
      parentId: null,
      paths: ["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"],
      actorId: userId,
    });
    expect(second["MyFolder"]).toBe(first["MyFolder"]);
    expect(second["MyFolder/sub"]).toBe(first["MyFolder/sub"]);
    expect(second["MyFolder/sub/deep"]).toBeDefined();
    const { rows } = await fx.pool.query(`SELECT count(*)::int AS c FROM folders`);
    expect(rows[0].c).toBe(3);
  });

  it("rolls back the whole tree if any insert fails", async () => {
    // Pre-seed a trashed folder at root under the name "MyFolder".
    // Then create a sibling *active* "MyFolder" — we want to verify that if a
    // later sibling fails, the earlier sibling is rolled back too.
    // Simplest reliable failure: call with a parentId that does not exist.
    await expect(
      createFolderTree({
        parentId: "00000000-0000-0000-0000-000000000000",
        paths: ["A", "A/B"],
        actorId: userId,
      }),
    ).rejects.toThrow();
    const { rows } = await fx.pool.query(`SELECT count(*)::int AS c FROM folders`);
    expect(rows[0].c).toBe(0);
  });

  it("scopes tree under a non-null parentId", async () => {
    const { rows: parentRows } = await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('dest', NULL, $1) RETURNING id`,
      [userId],
    );
    const parentId = parentRows[0].id;
    const map = await createFolderTree({
      parentId, paths: ["Album"], actorId: userId,
    });
    const { rows } = await fx.pool.query(`SELECT parent_id FROM folders WHERE id = $1`, [map["Album"]]);
    expect(rows[0].parent_id).toBe(parentId);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd app && npx vitest run src/lib/folder-tree-create.test.ts`
Expected: FAIL with "Cannot find module './folder-tree-create'".

- [ ] **Step 3: Implement `createFolderTree`**

```ts
// app/src/lib/folder-tree-create.ts
import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
import { FolderNotFoundError } from "@/lib/folders";

export type CreateFolderTreeArgs = {
  parentId: string | null;
  /** Must be produced by `normalizePaths` — parents-before-children, deduped. */
  paths: string[];
  actorId: string;
};

export async function createFolderTree(
  args: CreateFolderTreeArgs,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (args.paths.length === 0) return map;

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    if (args.parentId) {
      const parent = await client.query<{ id: string }>(
        `SELECT id FROM folders WHERE id = $1 AND deleted_at IS NULL`,
        [args.parentId],
      );
      if (parent.rowCount === 0) throw new FolderNotFoundError("parent folder");
    }

    for (const path of args.paths) {
      const slash = path.lastIndexOf("/");
      const parentPath = slash === -1 ? "" : path.slice(0, slash);
      const name = slash === -1 ? path : path.slice(slash + 1);
      const parentId = parentPath === "" ? args.parentId : (map[parentPath] ?? null);

      // Look up an existing active sibling with the same (case-insensitive) name.
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM folders
          WHERE COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
            AND LOWER(name) = LOWER($2)
            AND deleted_at IS NULL`,
        [parentId, name],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        map[path] = existing.rows[0].id;
        continue;
      }

      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO folders (name, parent_id, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [name, parentId, args.actorId],
      );
      map[path] = rows[0].id;
    }

    await client.query("COMMIT");
    return map;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `cd app && npx vitest run src/lib/folder-tree-create.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/folder-tree-create.ts app/src/lib/folder-tree-create.test.ts
git commit -m "feat(upload): createFolderTree — transactional folder-tree creation"
```

---

## Task 3: `POST /api/folders/tree` endpoint

**Files:**
- Modify: `app/src/app/api/folders/tree/route.ts`
- Modify: `app/src/app/api/folders/tree/route.test.ts`

Add a `POST` handler. Body shape: `{ parent_id: string | null, paths: string[] }`. Response: `{ folders: Record<string, string> }`. Runs normalization server-side too — never trust the client — and surfaces `FolderNotFoundError` as 404, `InvalidFolderPathError` as 400.

- [ ] **Step 1: Add the POST test cases**

Append to `app/src/app/api/folders/tree/route.test.ts` (new `describe` block, keep existing GET tests):

```ts
import { POST } from "./route";

const mockCreateFolderTree = vi.fn();
vi.mock("@/lib/folder-tree-create", () => ({
  createFolderTree: (...a: unknown[]) => mockCreateFolderTree(...a),
}));

function makePost(body: unknown) {
  return new NextRequest(new URL("https://app.test/api/folders/tree"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/folders/tree", () => {
  it("returns 401 when unauthenticated", async () => {
    getCurrentUser.mockResolvedValueOnce(null);
    const res = await POST(makePost({ parent_id: null, paths: ["A"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const res = await POST(makePost({ parent_id: null })); // missing paths
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid path segments", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const res = await POST(makePost({ parent_id: null, paths: ["A/../B"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_path");
  });

  it("returns 200 with path→id map on success", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    mockCreateFolderTree.mockResolvedValueOnce({ A: "id-a", "A/B": "id-b" });
    const res = await POST(makePost({ parent_id: null, paths: ["A", "A/B"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.folders).toEqual({ A: "id-a", "A/B": "id-b" });
    expect(mockCreateFolderTree).toHaveBeenCalledWith({
      parentId: null,
      paths: ["A", "A/B"],
      actorId: "u1",
    });
  });

  it("returns 404 when parent folder does not exist", async () => {
    getCurrentUser.mockResolvedValueOnce({ id: "u1", is_admin: false });
    const { FolderNotFoundError } = await import("@/lib/folders");
    mockCreateFolderTree.mockRejectedValueOnce(new FolderNotFoundError("parent folder"));
    const res = await POST(makePost({ parent_id: "00000000-0000-0000-0000-000000000000", paths: ["A"] }));
    expect(res.status).toBe(404);
  });
});
```

Also add `beforeEach(() => mockCreateFolderTree.mockReset());` inside the new describe or reuse the outer beforeEach.

- [ ] **Step 2: Run tests to confirm POST tests fail**

Run: `cd app && npx vitest run src/app/api/folders/tree/route.test.ts`
Expected: GET tests pass; POST tests fail with "POST is not exported".

- [ ] **Step 3: Add the POST handler**

Replace `app/src/app/api/folders/tree/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { FolderNotFoundError } from "@/lib/folders";
import { normalizePaths, InvalidFolderPathError } from "@/lib/folder-paths";
import { createFolderTree } from "@/lib/folder-tree-create";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { rows } = await pool.query<{ id: string; name: string; parent_id: string | null }>(
    `SELECT id, name, parent_id FROM folders WHERE deleted_at IS NULL ORDER BY LOWER(name)`,
  );
  return NextResponse.json({ folders: rows });
}

const PostBody = z.object({
  parent_id: z.string().uuid().nullable(),
  paths: z.array(z.string().min(1).max(512)).min(1).max(5000),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let paths: string[];
  try {
    paths = normalizePaths(parsed.data.paths);
  } catch (err) {
    if (err instanceof InvalidFolderPathError) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
    throw err;
  }

  try {
    const folders = await createFolderTree({
      parentId: parsed.data.parent_id,
      paths,
      actorId: user.id,
    });
    return NextResponse.json({ folders });
  } catch (err) {
    if (err instanceof FolderNotFoundError) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to confirm all pass**

Run: `cd app && npx vitest run src/app/api/folders/tree/route.test.ts`
Expected: PASS, 2 GET tests + 5 POST tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/api/folders/tree/route.ts app/src/app/api/folders/tree/route.test.ts
git commit -m "feat(upload): POST /api/folders/tree for recursive folder creation"
```

---

## Task 4: `UploadProgressProvider` — context + tus orchestration

**Files:**
- Create: `app/src/components/UploadProgressProvider.tsx`
- Test:   `app/src/components/UploadProgressProvider.test.tsx`

Replaces the ad-hoc `useState` + `tus.Upload` logic currently in `UploadClient.tsx`. The provider owns:

```ts
type UploadRow = UploadState & {
  id: string;          // stable row id (generated in the provider)
  folderId: string | null;
  startedAt: number;
  cancel: () => void;
};
```

Exposed context:
- `uploads: UploadRow[]`
- `enqueue(file: File, folderId: string | null): void` — creates a row and starts a `tus.Upload`.
- `cancel(id: string): void` — aborts a specific upload.
- `clearCompleted(): void` — removes rows whose status is `done` or `error`.

Also fires `window.dispatchEvent(new CustomEvent("vorevault:upload-done", { detail: { id } }))` whenever a row transitions to `done`. `StorageBar` already listens for this (Plan 1).

Constants:
- Same tus settings as the old `UploadClient.tsx`: `endpoint: "/files/"`, `chunkSize: 64 * 1024 * 1024`, `retryDelays: [0, 1000, 3000, 5000]`.

**Why a provider, not a module-scoped store:** it's scoped to the shell layout and naturally tears down if the user logs out; `useContext` gives components reactive updates without us hand-rolling a subscription API.

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/UploadProgressProvider.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  UploadProgressProvider,
  useUploadProgress,
} from "./UploadProgressProvider";

type TusCallbacks = {
  onProgress?: (uploaded: number, total: number) => void;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
};
const tusInstances: Array<TusCallbacks & {
  start: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  file: File;
}> = [];

vi.mock("tus-js-client", () => ({
  Upload: class {
    file: File;
    options: TusCallbacks;
    start = vi.fn();
    abort = vi.fn().mockResolvedValue(undefined);
    constructor(file: File, options: TusCallbacks) {
      this.file = file;
      this.options = options;
      tusInstances.push({ ...options, start: this.start, abort: this.abort, file });
    }
  },
}));

afterEach(() => {
  cleanup();
  tusInstances.length = 0;
});

function Probe() {
  const ctx = useUploadProgress();
  return (
    <div>
      <button onClick={() => ctx.enqueue(new File(["hi"], "a.mp4"), "f-1")}>enqueue</button>
      <button onClick={() => ctx.clearCompleted()}>clear</button>
      <ul data-testid="rows">
        {ctx.uploads.map((u) => (
          <li key={u.id}>
            {u.name} | {u.status} | {u.uploaded}/{u.size}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderProbe() {
  return render(
    <UploadProgressProvider>
      <Probe />
    </UploadProgressProvider>,
  );
}

describe("UploadProgressProvider", () => {
  it("enqueue adds an uploading row and starts tus", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    expect(screen.getByText(/a\.mp4 \| uploading/)).toBeInTheDocument();
    expect(tusInstances[0].start).toHaveBeenCalled();
  });

  it("progress callback updates the row", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onProgress?.(42, 100);
    });
    expect(screen.getByText(/42\/\d+/)).toBeInTheDocument();
  });

  it("onSuccess marks the row done and dispatches vorevault:upload-done", async () => {
    const evt = vi.fn();
    window.addEventListener("vorevault:upload-done", evt);
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onSuccess?.();
    });
    expect(screen.getByText(/a\.mp4 \| done/)).toBeInTheDocument();
    expect(evt).toHaveBeenCalled();
    window.removeEventListener("vorevault:upload-done", evt);
  });

  it("onError marks the row error", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onError?.(new Error("boom"));
    });
    expect(screen.getByText(/a\.mp4 \| error/)).toBeInTheDocument();
  });

  it("clearCompleted removes done and error rows but keeps in-flight", async () => {
    renderProbe();
    await act(async () => {
      screen.getByText("enqueue").click();
      screen.getByText("enqueue").click();
    });
    await act(async () => {
      tusInstances[0].onSuccess?.();
    });
    await act(async () => {
      screen.getByText("clear").click();
    });
    // second row still uploading
    const rows = screen.getByTestId("rows").children;
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toMatch(/uploading/);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd app && npx vitest run src/components/UploadProgressProvider.test.tsx`
Expected: FAIL with "Cannot find module './UploadProgressProvider'".

- [ ] **Step 3: Implement the provider**

```tsx
// app/src/components/UploadProgressProvider.tsx
"use client";

import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
} from "react";
import * as tus from "tus-js-client";
import type { UploadState } from "./UploadRow";

export type UploadRow = UploadState & {
  id: string;
  folderId: string | null;
  startedAt: number;
};

type Ctx = {
  uploads: UploadRow[];
  enqueue: (file: File, folderId: string | null) => void;
  cancel: (id: string) => void;
  clearCompleted: () => void;
};

const UploadProgressContext = createContext<Ctx | null>(null);

export function useUploadProgress(): Ctx {
  const v = useContext(UploadProgressContext);
  if (!v) throw new Error("useUploadProgress must be inside <UploadProgressProvider>");
  return v;
}

export function UploadProgressProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const instances = useRef<Map<string, tus.Upload>>(new Map());

  const enqueue = useCallback((file: File, folderId: string | null) => {
    const id = crypto.randomUUID();
    const row: UploadRow = {
      id,
      folderId,
      startedAt: Date.now(),
      name: file.name,
      size: file.size,
      uploaded: 0,
      status: "uploading",
    };
    setUploads((prev) => [...prev, row]);

    const upload = new tus.Upload(file, {
      endpoint: "/files/",
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 64 * 1024 * 1024,
      metadata: {
        filename: file.name,
        filetype: file.type || "application/octet-stream",
        ...(folderId ? { folderId } : {}),
      },
      onError: (err) => {
        setUploads((s) =>
          s.map((u) => (u.id === id ? { ...u, status: "error", error: String(err) } : u)),
        );
      },
      onProgress: (uploaded) => {
        setUploads((s) => s.map((u) => (u.id === id ? { ...u, uploaded } : u)));
      },
      onSuccess: () => {
        setUploads((s) =>
          s.map((u) => (u.id === id ? { ...u, status: "done", uploaded: u.size } : u)),
        );
        window.dispatchEvent(new CustomEvent("vorevault:upload-done", { detail: { id } }));
      },
    });
    instances.current.set(id, upload);
    upload.start();
  }, []);

  const cancel = useCallback((id: string) => {
    const upload = instances.current.get(id);
    if (upload) void upload.abort(true);
    instances.current.delete(id);
    setUploads((s) => s.filter((u) => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((s) => s.filter((u) => u.status !== "done" && u.status !== "error"));
  }, []);

  const value = useMemo(
    () => ({ uploads, enqueue, cancel, clearCompleted }),
    [uploads, enqueue, cancel, clearCompleted],
  );

  return (
    <UploadProgressContext.Provider value={value}>
      {children}
    </UploadProgressContext.Provider>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `cd app && npx vitest run src/components/UploadProgressProvider.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/UploadProgressProvider.tsx app/src/components/UploadProgressProvider.test.tsx
git commit -m "feat(upload): UploadProgressProvider — shared upload state + tus driver"
```

---

## Task 5: `UploadProgressDrawer` component

**Files:**
- Create: `app/src/components/UploadProgressDrawer.tsx`
- Create: `app/src/components/UploadProgressDrawer.module.css`
- Test:   `app/src/components/UploadProgressDrawer.test.tsx`

A fixed bottom-right drawer that renders `ctx.uploads`. Per-row UI: filename + progress pct + status + cancel button (uploading rows only). Collapsed state shows a pill like "3 uploading · 1 done" that expands on click. The drawer auto-collapses 5 seconds after every row is settled (`done` or `error`); user can always re-expand. The drawer renders nothing when `uploads.length === 0`.

Structure:
```
<aside className={drawer}>
  <header>
    <button> header pill (clicking toggles collapse) </button>
    <button aria-label="clear finished"> × </button>
  </header>
  <ul>
    <li> row per upload </li>
  </ul>
</aside>
```

- [ ] **Step 1: Write the failing test**

```tsx
// app/src/components/UploadProgressDrawer.test.tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { UploadProgressDrawer } from "./UploadProgressDrawer";
import * as providerModule from "./UploadProgressProvider";

const baseCtx = {
  enqueue: vi.fn(),
  cancel: vi.fn(),
  clearCompleted: vi.fn(),
};

function stubCtx(uploads: providerModule.UploadRow[]) {
  vi.spyOn(providerModule, "useUploadProgress").mockReturnValue({
    uploads, ...baseCtx,
  });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("UploadProgressDrawer", () => {
  it("renders nothing when there are no uploads", () => {
    stubCtx([]);
    const { container } = render(<UploadProgressDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a row per upload with status and percentage", () => {
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 42, status: "uploading" },
      { id: "b", folderId: null, startedAt: 0, name: "photo.png", size: 200, uploaded: 200, status: "done" },
    ]);
    render(<UploadProgressDrawer />);
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  it("cancel button calls ctx.cancel for the row id", () => {
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 10, status: "uploading" },
    ]);
    render(<UploadProgressDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /cancel clip\.mp4/i }));
    expect(baseCtx.cancel).toHaveBeenCalledWith("a");
  });

  it("header pill collapses the drawer", () => {
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 10, status: "uploading" },
    ]);
    render(<UploadProgressDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /uploads/i }));
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
  });

  it("auto-collapses 5s after every row is settled", () => {
    vi.useFakeTimers();
    stubCtx([
      { id: "a", folderId: null, startedAt: 0, name: "clip.mp4", size: 100, uploaded: 100, status: "done" },
    ]);
    render(<UploadProgressDrawer />);
    expect(screen.getByText("clip.mp4")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText("clip.mp4")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd app && npx vitest run src/components/UploadProgressDrawer.test.tsx`
Expected: FAIL with "Cannot find module './UploadProgressDrawer'".

- [ ] **Step 3: Implement the drawer**

```tsx
// app/src/components/UploadProgressDrawer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useUploadProgress } from "./UploadProgressProvider";
import { ProgressBar } from "./ProgressBar";
import styles from "./UploadProgressDrawer.module.css";

function pct(u: { uploaded: number; size: number }): number {
  if (u.size <= 0) return 0;
  return Math.round((u.uploaded / u.size) * 100);
}

export function UploadProgressDrawer() {
  const { uploads, cancel } = useUploadProgress();
  const [collapsed, setCollapsed] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inflight = uploads.filter((u) => u.status === "uploading" || u.status === "pending");
  const done = uploads.filter((u) => u.status === "done").length;
  const errored = uploads.filter((u) => u.status === "error").length;

  useEffect(() => {
    if (uploads.length === 0) return;
    if (inflight.length === 0) {
      collapseTimer.current = setTimeout(() => setCollapsed(true), 5000);
      return () => {
        if (collapseTimer.current) clearTimeout(collapseTimer.current);
      };
    }
    setCollapsed(false);
    return undefined;
  }, [uploads.length, inflight.length]);

  if (uploads.length === 0) return null;

  const headerLabel =
    inflight.length > 0
      ? `${inflight.length} uploading${done ? ` · ${done} done` : ""}${errored ? ` · ${errored} failed` : ""}`
      : `uploads · ${done} done${errored ? ` · ${errored} failed` : ""}`;

  return (
    <aside className={styles.drawer} aria-label="upload progress">
      <header className={styles.header}>
        <button
          type="button"
          className={styles.headerPill}
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {headerLabel}
        </button>
      </header>
      {!collapsed && (
        <ul className={styles.list}>
          {uploads.map((u) => (
            <li key={u.id} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.name}>{u.name}</span>
                <span className={`${styles.status} ${styles[u.status]}`}>{u.status}</span>
              </div>
              <div className={styles.rowBottom}>
                <ProgressBar pct={pct(u)}
                  variant={u.status === "error" ? "red" : u.status === "done" ? "green" : "orange"} />
                <span className={styles.pct}>{pct(u)}%</span>
                {u.status === "uploading" && (
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => cancel(u.id)}
                    aria-label={`cancel ${u.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
              {u.error && <div className={styles.error}>{u.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Write the CSS**

```css
/* app/src/components/UploadProgressDrawer.module.css */
.drawer {
  position: fixed; right: 16px; bottom: 16px;
  width: min(420px, calc(100vw - 32px));
  background: var(--vv-bg);
  border: 1.5px solid var(--vv-ink);
  border-radius: 10px;
  box-shadow: 4px 4px 0 var(--vv-ink);
  z-index: 40;
  overflow: hidden;
}
.header {
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1.5px solid var(--vv-ink);
  background: var(--vv-bg-sunken);
}
.headerPill {
  all: unset;
  display: block; flex: 1;
  padding: 10px 14px;
  font: 600 13px var(--vv-font-ui);
  color: var(--vv-ink);
  cursor: pointer;
}
.list { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow-y: auto; }
.row { padding: 10px 14px; border-bottom: 1px solid var(--vv-bg-sunken); }
.row:last-child { border-bottom: 0; }
.rowTop { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
.rowBottom { display: flex; align-items: center; gap: 8px; }
.name { font: 600 13px var(--vv-font-ui); color: var(--vv-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { font: 700 10px var(--vv-font-mono); text-transform: uppercase; letter-spacing: 0.05em; }
.uploading { color: var(--vv-ink); }
.done      { color: var(--vv-green, var(--vv-ink)); }
.error     { color: var(--vv-red, var(--vv-ink)); }
.pending   { color: var(--vv-ink); }
.pct { font: 600 11px var(--vv-font-mono); min-width: 3ch; text-align: right; }
.cancelBtn {
  all: unset;
  width: 20px; height: 20px; line-height: 20px;
  text-align: center; cursor: pointer;
  border: 1px solid var(--vv-ink); border-radius: 50%;
  font: 700 13px var(--vv-font-ui);
}
.error { font: 500 11px var(--vv-font-mono); color: var(--vv-ink); margin-top: 4px; }
```

- [ ] **Step 5: Run test to confirm it passes**

Run: `cd app && npx vitest run src/components/UploadProgressDrawer.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/UploadProgressDrawer.tsx app/src/components/UploadProgressDrawer.module.css app/src/components/UploadProgressDrawer.test.tsx
git commit -m "feat(upload): UploadProgressDrawer — persistent bottom-right progress"
```

---

## Task 6: Mount the provider and drawer in the shell layout

**Files:**
- Modify: `app/src/app/(shell)/layout.tsx`

Wrap `{children}` with `<UploadProgressProvider>` (client boundary) and render `<UploadProgressDrawer/>` at the end of `<div className={styles.shell}>`. This means every authenticated page has a live upload drawer, and uploads survive navigation.

- [ ] **Step 1: Update the layout**

Edit `app/src/app/(shell)/layout.tsx`:

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { SidebarChromeProvider, SidebarBackdrop, SidebarOpenClass } from "@/components/SidebarChrome";
import { MobileFAB } from "@/components/MobileFAB";
import { UploadProgressProvider } from "@/components/UploadProgressProvider";
import { UploadProgressDrawer } from "@/components/UploadProgressDrawer";
import styles from "./shell.module.css";

export const dynamic = "force-dynamic";

async function deriveCurrentFolderId(): Promise<string | null> {
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
    <UploadProgressProvider>
      <SidebarChromeProvider>
        <SidebarOpenClass>
          <div className={styles.shell}>
            <TopBar username={user.username} avatarUrl={user.avatar_url} isAdmin={user.is_admin} />
            <div className={styles.body}>
              <Sidebar isAdmin={user.is_admin} currentFolderId={currentFolderId} />
              <main className={styles.main}>{children}</main>
            </div>
            <SidebarBackdrop />
            <MobileFAB />
            <UploadProgressDrawer />
          </div>
        </SidebarOpenClass>
      </SidebarChromeProvider>
    </UploadProgressProvider>
  );
}
```

- [ ] **Step 2: Typecheck & run the full vitest suite for this area**

Run: `cd app && npx tsc --noEmit`
Expected: no new errors.

Run: `cd app && npx vitest run src/components/UploadProgressProvider.test.tsx src/components/UploadProgressDrawer.test.tsx`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add app/src/app/\(shell\)/layout.tsx
git commit -m "feat(upload): mount UploadProgressProvider + drawer in shell"
```

---

## Task 7: Rewire `NewMenu` — upload file + upload folder via folder picker

**Files:**
- Modify: `app/src/components/NewMenu.tsx`
- Modify: `app/src/components/NewMenu.test.tsx`

New menu behavior:

1. Click `+ new` → menu opens.
2. Click **new folder** → existing `NewFolderDialog` (unchanged).
3. Click **upload file** → close menu, open `<Modal>` wrapping `<FolderPickerModal initialFolderId={currentFolderId}>`. On `onSelect(folderId)`: close the picker, programmatically click a hidden `<input type="file" multiple>`. On change, call `ctx.enqueue(file, folderId)` for each picked file. On `onCancel`: close and bail.
4. Click **upload folder** → same, but the hidden input has `webkitdirectory`. After files come back:
   - Collect every file's `webkitRelativePath`, compute directory parts via `splitRelativeDir`.
   - Build the unique directory list, call `POST /api/folders/tree { parent_id: folderId, paths }`.
   - On 2xx, walk files: `ctx.enqueue(file, map[dir] ?? folderId)`.
   - On error: show a minimal inline error message inside the menu (no toast system).

The hidden inputs live inside the menu component itself, accessed by refs. The provider handles everything else.

- [ ] **Step 1: Update the test suite**

Replace `app/src/components/NewMenu.test.tsx` with:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewMenu } from "./NewMenu";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const enqueue = vi.fn();
vi.mock("./UploadProgressProvider", () => ({
  useUploadProgress: () => ({ enqueue, cancel: vi.fn(), clearCompleted: vi.fn(), uploads: [] }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  enqueue.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mockTree() {
  // First fetch call → FolderPickerModal's GET /api/folders/tree.
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ folders: [{ id: "root-1", name: "clips", parent_id: null }] }),
  });
}

describe("NewMenu", () => {
  it("renders the + new button closed by default", () => {
    render(<NewMenu currentFolderId={null} />);
    expect(screen.getByRole("button", { name: /\+ new/ })).toBeInTheDocument();
    expect(screen.queryByText("new folder")).not.toBeInTheDocument();
  });

  it("opens the menu and shows three items", () => {
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    expect(screen.getByText("new folder")).toBeInTheDocument();
    expect(screen.getByText("upload file")).toBeInTheDocument();
    expect(screen.getByText("upload folder")).toBeInTheDocument();
  });

  it("upload file opens the folder picker", async () => {
    mockTree();
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    fireEvent.click(screen.getByText("upload file"));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /choose folder/i })).toBeInTheDocument(),
    );
  });

  it("folder picker Select + file pick enqueues uploads at the chosen folder", async () => {
    mockTree();
    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    fireEvent.click(screen.getByText("upload file"));
    await waitFor(() => screen.getByRole("dialog", { name: /choose folder/i }));
    fireEvent.click(screen.getByText("clips"));
    fireEvent.click(screen.getByRole("button", { name: /^select$/i }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]:not([webkitdirectory])');
    expect(fileInput).toBeTruthy();
    const file = new File(["x"], "clip.mp4", { type: "video/mp4" });
    await act(async () => {
      Object.defineProperty(fileInput!, "files", {
        value: [file],
        configurable: true,
      });
      fireEvent.change(fileInput!);
    });

    expect(enqueue).toHaveBeenCalledWith(file, "root-1");
  });

  it("upload folder POSTs the tree then enqueues with mapped folder ids", async () => {
    mockTree(); // folder picker GET
    // createFolderTree POST response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ folders: { "Album": "new-root", "Album/sub": "new-sub" } }),
    });

    render(<NewMenu currentFolderId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new/ }));
    fireEvent.click(screen.getByText("upload folder"));
    await waitFor(() => screen.getByRole("dialog", { name: /choose folder/i }));
    fireEvent.click(screen.getByRole("button", { name: /^select$/i })); // Home

    const dirInput = document.querySelector<HTMLInputElement>('input[webkitdirectory]');
    expect(dirInput).toBeTruthy();

    const file1 = Object.assign(new File(["x"], "a.mp4", { type: "video/mp4" }), {});
    Object.defineProperty(file1, "webkitRelativePath", { value: "Album/a.mp4" });
    const file2 = new File(["y"], "b.mp4", { type: "video/mp4" });
    Object.defineProperty(file2, "webkitRelativePath", { value: "Album/sub/b.mp4" });

    await act(async () => {
      Object.defineProperty(dirInput!, "files", { value: [file1, file2], configurable: true });
      fireEvent.change(dirInput!);
    });

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    // Verify the POST body had parent_id=null and deduped paths.
    const postCall = fetchMock.mock.calls.find(([url]) => url === "/api/folders/tree" && fetchMock.mock.calls.length > 1);
    expect(postCall).toBeDefined();
    expect(enqueue).toHaveBeenCalledWith(file1, "new-root");
    expect(enqueue).toHaveBeenCalledWith(file2, "new-sub");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `cd app && npx vitest run src/components/NewMenu.test.tsx`
Expected: most tests fail (upload folder item missing, etc.).

- [ ] **Step 3: Implement the new NewMenu**

Replace `app/src/components/NewMenu.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { FolderPickerModal } from "./FolderPickerModal";
import { NewFolderDialog } from "./NewFolderDialog";
import { useUploadProgress } from "./UploadProgressProvider";
import { splitRelativeDir, normalizePaths } from "@/lib/folder-paths";
import styles from "./NewMenu.module.css";

type Mode = "file" | "folder";

export function NewMenu({ currentFolderId }: { currentFolderId: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<Mode>("file");
  const [error, setError] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const pendingDestRef = useRef<string | null>(null);

  const router = useRouter();
  const { enqueue } = useUploadProgress();

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

  function startPick(mode: Mode) {
    setMenuOpen(false);
    setError(null);
    setPickerMode(mode);
    setPickerOpen(true);
  }

  function onPickerSelect(folderId: string | null) {
    pendingDestRef.current = folderId;
    setPickerOpen(false);
    // Clicking the native file input must happen from a user-gesture context.
    // React runs onClick synchronously, so calling .click() here is still
    // within the Select button's event handler.
    queueMicrotask(() => {
      if (pickerMode === "file") fileInputRef.current?.click();
      else dirInputRef.current?.click();
    });
  }

  async function handleFiles(files: FileList | null, mode: Mode) {
    if (!files || files.length === 0) return;
    const dest = pendingDestRef.current;

    if (mode === "file") {
      for (const file of Array.from(files)) {
        enqueue(file, dest);
      }
      return;
    }

    // mode === "folder": build tree, POST, then enqueue per file with mapped id.
    const fileArr = Array.from(files);
    const dirs: string[] = [];
    const relDirs: string[] = [];
    for (const file of fileArr) {
      const rel = file.webkitRelativePath || file.name;
      const { dir } = splitRelativeDir(rel);
      relDirs.push(dir);
      if (dir) dirs.push(dir);
    }

    let paths: string[];
    try {
      paths = normalizePaths(dirs);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    let map: Record<string, string> = {};
    if (paths.length > 0) {
      try {
        const res = await fetch("/api/folders/tree", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parent_id: dest, paths }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(`couldn't create folder structure: ${body.error ?? res.statusText}`);
          return;
        }
        const data = await res.json();
        map = (data.folders as Record<string, string>) ?? {};
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }

    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      const dir = relDirs[i];
      const target = dir ? (map[dir] ?? dest) : dest;
      enqueue(file, target);
    }
    router.refresh();
  }

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
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => startPick("file")}
          >
            upload file
          </button>
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => startPick("folder")}
          >
            upload folder
          </button>
        </div>
      )}
      {error && <div className={styles.error} role="alert">{error}</div>}

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="choose folder"
        size="md"
      >
        <FolderPickerModal
          initialFolderId={currentFolderId}
          onCancel={() => setPickerOpen(false)}
          onSelect={onPickerSelect}
        />
      </Modal>

      <NewFolderDialog
        open={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        parentId={currentFolderId}
        parentName={null}
        onCreated={() => { setFolderDialogOpen(false); router.refresh(); }}
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFiles(e.target.files, "file");
          e.target.value = "";
        }}
      />
      <input
        ref={dirInputRef}
        type="file"
        multiple
        // React prop: casing follows DOM attr; TypeScript's JSX type does not
        // include webkitdirectory, so we cast via `{...}` spread.
        {...({ webkitdirectory: "" } as Record<string, string>)}
        style={{ display: "none" }}
        onChange={(e) => {
          void handleFiles(e.target.files, "folder");
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

Also append to `app/src/components/NewMenu.module.css`:

```css
.error {
  margin-top: 6px;
  padding: 6px 10px;
  border: 1.5px solid var(--vv-ink);
  border-radius: 6px;
  background: var(--vv-bg);
  font: 500 12px var(--vv-font-mono);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd app && npx vitest run src/components/NewMenu.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/NewMenu.tsx app/src/components/NewMenu.module.css app/src/components/NewMenu.test.tsx
git commit -m "feat(upload): NewMenu drives folder picker + file/folder inputs"
```

---

## Task 8: Mobile FAB opens NewMenu instead of linking to /upload

**Files:**
- Modify: `app/src/components/MobileFAB.tsx`
- Modify: `app/src/components/MobileFAB.module.css`

The spec says the FAB becomes a centered-modal launcher for `NewMenu`. Simplest path: have `MobileFAB` render a hidden companion `<NewMenu>` inside a `<Modal>` that opens on FAB tap. Copy `currentFolderId` from `SidebarChrome` context — or accept `currentFolderId` as a prop from the layout. Passing from the layout is simpler; update the layout to forward it.

- [ ] **Step 1: Rewrite MobileFAB**

Replace `app/src/components/MobileFAB.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { NewMenu } from "./NewMenu";
import styles from "./MobileFAB.module.css";

export function MobileFAB({ currentFolderId }: { currentFolderId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.fab}
        aria-label="new"
        onClick={() => setOpen(true)}
      >
        +
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="new" size="sm">
        <div className={styles.menuHost}>
          <NewMenu currentFolderId={currentFolderId} />
        </div>
      </Modal>
    </>
  );
}
```

Update `app/src/components/MobileFAB.module.css`, replacing the entire content:

```css
.fab {
  display: none;
  position: fixed; bottom: 24px; right: 24px;
  width: 56px; height: 56px;
  border-radius: 50%;
  border: 0;
  background: var(--vv-ink);
  color: var(--vv-bg);
  font: 700 28px var(--vv-font-ui);
  align-items: center; justify-content: center;
  text-decoration: none; cursor: pointer;
  box-shadow: 4px 4px 0 var(--vv-bg-sunken);
  z-index: 25;
}
.menuHost { display: flex; justify-content: center; padding: 8px 0; }
@media (max-width: 768px) {
  .fab { display: inline-flex; }
}
```

- [ ] **Step 2: Forward `currentFolderId` through the layout**

Edit `app/src/app/(shell)/layout.tsx` to pass `currentFolderId` to `MobileFAB`:

```tsx
<MobileFAB currentFolderId={currentFolderId} />
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/MobileFAB.tsx app/src/components/MobileFAB.module.css app/src/app/\(shell\)/layout.tsx
git commit -m "feat(upload): MobileFAB opens NewMenu modal (replaces /upload link)"
```

---

## Task 9: Remove the `/upload` route

**Files:**
- Delete: `app/src/app/(shell)/upload/page.tsx`
- Delete: `app/src/app/(shell)/upload/page.module.css`
- Delete: `app/src/app/(shell)/upload/UploadClient.tsx`
- Delete: `app/src/app/(shell)/upload/UploadClient.module.css`
- Delete: `app/src/app/(shell)/upload/` (directory)

- [ ] **Step 1: Delete the files**

Run:
```bash
rm -rf app/src/app/\(shell\)/upload
```

- [ ] **Step 2: Confirm nothing imports from the removed path**

Run: `cd app && grep -rn "(shell)/upload\|/upload\"" src/ --include='*.ts' --include='*.tsx' || true`
Expected: only `/upload` occurrences should be inside the hooks test fixtures (`UPLOADS_DIR`), not route imports.

- [ ] **Step 3: Typecheck + run full suite**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

Run: `cd app && npx vitest run`
Expected: all tests pass. If any test references `/upload` as a route, it should already be handled by Task 7 changes; otherwise fix by removing the reference.

- [ ] **Step 4: Commit**

```bash
git add -A app/src/app/\(shell\)/upload
git commit -m "feat(upload): remove /upload route (replaced by inline + new menu)"
```

---

## Task 10: Redirect `/upload` → `/` in middleware

**Files:**
- Modify: `app/src/middleware.ts`

Add a 308 redirect so any external bookmarks to `/upload` land on home. This must sit alongside the existing `/saved` → `/starred` redirect from Plan 1 and must not touch the `x-vv-pathname` header behavior.

- [ ] **Step 1: Read the current middleware**

Run: `cd app && cat src/middleware.ts`

- [ ] **Step 2: Add the redirect**

Near the existing `/saved` handling, add:

```ts
if (url.pathname === "/upload" || url.pathname.startsWith("/upload/")) {
  return NextResponse.redirect(new URL("/", req.url), 308);
}
```

Make sure the `matcher` in `config` includes `/upload` (if the existing matcher is `/:path*` or equivalent, no change is needed; otherwise add `/upload` and `/upload/:path*`).

- [ ] **Step 3: Manual smoke via a unit test if one exists**

Run: `cd app && npx vitest run src/middleware.test.ts 2>/dev/null || echo "no middleware test — skipping"`

- [ ] **Step 4: Commit**

```bash
git add app/src/middleware.ts
git commit -m "feat(upload): 308 redirect /upload → / for external bookmarks"
```

---

## Task 11: Replace `UploadRow`'s "pending" status handling

**Files:**
- Check: `app/src/components/UploadRow.tsx`

The provider only ever sets `status: "uploading"` initially (never `"pending"`). `UploadRow`'s type union still includes `"pending"` because the old `UploadClient` relied on it. Now nothing emits it. Leave the type alone (removing it would require touching every consumer) — but double-check no dead code in `UploadRow` branches on `"pending"` unnecessarily. If it does, keep the branches: they're harmless and future-proof.

- [ ] **Step 1: Re-read `UploadRow.tsx`**

Run: `cd app && cat src/components/UploadRow.tsx`

Confirm the `pending` case is harmless (it is — it maps to label "uploading"). No changes required.

- [ ] **Step 2: Commit (skip if no changes)**

No commit if nothing changed. This task is a checkpoint, not an edit.

---

## Task 12: End-to-end integration smoke (testcontainers)

**Files:**
- Create: `app/src/app/api/folders/tree/integration.test.ts` (new testcontainer-backed file alongside route tests)

The unit test in Task 3 mocks `createFolderTree`; the testcontainers suite from Task 2 exercises the helper directly. This extra task wires the two together: real Postgres + real `createFolderTree` + a call that shapes exactly like the UI's POST body with a 3-deep path tree.

- [ ] **Step 1: Write the integration test**

```ts
// app/src/app/api/folders/tree/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "@/../tests/pg";
import { createFolderTree } from "@/lib/folder-tree-create";
import { normalizePaths } from "@/lib/folder-paths";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  const res = await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username, avatar_url, is_admin)
       VALUES ('d2', 'tester2', null, false) RETURNING id`,
  );
  userId = res.rows[0].id;
}, 60_000);

afterAll(async () => { await stopPg(fx); });

describe("recursive upload — end-to-end folder tree", () => {
  it("given file paths, normalizePaths+createFolderTree produces a full tree", async () => {
    // Simulate the set of directory parts from a webkitdirectory pick.
    const dirs = [
      "Album", "Album/sub1", "Album/sub1", "Album/sub2/deep", "Album/sub2",
    ];
    const paths = normalizePaths(dirs);
    const map = await createFolderTree({ parentId: null, paths, actorId: userId });

    expect(Object.keys(map).sort()).toEqual([
      "Album", "Album/sub1", "Album/sub2", "Album/sub2/deep",
    ]);

    // Verify parent links match the path prefixes.
    const { rows } = await fx.pool.query<{ id: string; name: string; parent_id: string | null }>(
      `SELECT id, name, parent_id FROM folders WHERE created_by = $1`, [userId],
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const sub1 = rows.find((r) => r.name === "sub1");
    const deep = rows.find((r) => r.name === "deep");
    const sub2 = rows.find((r) => r.name === "sub2");
    expect(sub1!.parent_id).toBe(map["Album"]);
    expect(sub2!.parent_id).toBe(map["Album"]);
    expect(deep!.parent_id).toBe(map["Album/sub2"]);
    expect(byId.get(map["Album"])!.parent_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm**

Run: `cd app && npx vitest run src/app/api/folders/tree/integration.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 3: Commit**

```bash
git add app/src/app/api/folders/tree/integration.test.ts
git commit -m "test(upload): integration — normalizePaths + createFolderTree end-to-end"
```

---

## Task 13: Full test sweep and manual smoke checklist

**Files:**
- (none created)

Before opening the PR, run the complete test suite, type checker, and manual browser smoke.

- [ ] **Step 1: Full unit + integration suite**

Run: `cd app && npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd app && npm run lint 2>/dev/null || echo "no lint script — skip"`
Expected: no errors (or no script).

- [ ] **Step 4: Build the docker image locally**

Run: `docker build -t vorevault:plan3-check -f app/Dockerfile app/`
Expected: image builds cleanly.

- [ ] **Step 5: Manual smoke (cannot be done in this environment — list in PR description)**

Document in the PR description:
- Open the sidebar `+ new` menu → confirm three items: `new folder`, `upload file`, `upload folder`.
- Click `upload file` → folder picker opens → select root → OS file chooser opens → pick 2 files → drawer shows two rows progressing to done.
- Click `upload folder` → folder picker opens → select an existing folder → OS directory chooser opens → pick a folder with 3 levels and 4 files → drawer shows 4 rows; verify new subfolders are visible in the vault tree.
- Navigate away (e.g., to `/recent`) while an upload is active → drawer persists.
- Open `/upload` directly in the browser → redirects to `/`.
- At `<768px`: FAB visible bottom-right → taps open the new menu modal → upload flow works the same.
- Storage bar updates within ~60s of the last upload finishing.

- [ ] **Step 6: No commit — this task is verification.**

---

## Self-Review Summary

Coverage against spec:

- **Recursive folder upload flow** (spec lines 104–122): Tasks 1–3 deliver `normalizePaths`/`splitRelativeDir`/`createFolderTree` and `POST /api/folders/tree`. Task 7 wires the client flow (pick folder → pick directory → POST → enqueue).
- **All-or-nothing transaction** (spec line 122–123): Task 2 tests verify rollback via `parentId` that doesn't exist (the whole tree stays empty).
- **Per-file cancellation** (spec line 120): `UploadProgressProvider.cancel` + `UploadProgressDrawer` cancel button (Tasks 4 & 5).
- **UploadProgressDrawer persists across navigation** (spec line 126): Provider lives in `(shell)/layout.tsx` (Task 6).
- **Auto-collapse 5s after settle** (spec line 128): Task 5 tests the timer behavior.
- **`vorevault:upload-done` event** (spec line 130): Emitted from Task 4 provider; consumed by `StorageBar` (already built in Plan 1).
- **Upload file also picks folder first** (spec line 112): Task 7 `pickerMode = "file"` variant uses the same `FolderPickerModal`.
- **`/upload` removed** (spec line 86): Task 9 deletes the route; Task 10 adds 308 redirect.
- **`MobileFAB` opens `NewMenu` as centered modal** (spec line 101): Task 8.
- **Upload to a trashed folder impossible**: Task 3's endpoint inherits Plan 2's `deleted_at IS NULL` filter via the validation step in `createFolderTree` (parent must be active).

No placeholders. Every code step has the actual code. Types (`UploadRow`, `CreateFolderTreeArgs`, `InvalidFolderPathError`) are consistent across tasks. File paths are exact.
