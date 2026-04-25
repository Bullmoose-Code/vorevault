# Prev/Next File Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `←/→` keyboard navigation and on-screen prev/next buttons to the file detail page that walk the same list the user came from (folder, recent, mine, starred, or tag-filtered home).

**Architecture:** A new `app/src/lib/neighbors.ts` exports `parseFromParam` (URL → context) and `getNeighbors` (context → prev/next file IDs via two indexed SQL queries each with a deterministic `(created_at, id)` tie-breaker). Each grid passes a `fromQuery` prop to its `FileCard`s, which append it to the `/f/<id>` href. The file-detail page parses the `from` searchParam and renders two new components: `PrevNextNav` (server, two anchors with disabled state) and `PrevNextKeys` (client, key-listener only).

**Tech Stack:** TypeScript strict, Next.js 15 App Router, Vitest + testcontainers (Postgres 16), `pg` Pool.

---

## Spec

`docs/superpowers/specs/2026-04-25-prev-next-file-nav-design.md`. Read the spec for the full design rationale, behavior matrix, and edge cases. The plan implements every "in scope" item.

---

## Conventions you'll follow

Pulled from `CLAUDE.md`, `DESIGN.md`, and existing code in `app/src/lib/` and `app/src/components/`:

- **TDD**: write the failing test first, run it, then implement.
- **TypeScript strict**, no `any`, no `@ts-ignore` without a written reason.
- **Vitest** is the runner; tests are colocated (`foo.ts` + `foo.test.ts` for unit, `foo.integration.test.ts` for testcontainers).
- **No DB mocking in integration tests.** Use `tests/pg.ts`'s `startPg()`/`stopPg()` fixture (see `app/src/lib/files.topLevel.integration.test.ts` for the pattern). Integration tests skip locally without Docker — they run on CI. Don't fight that.
- **React component tests** use `// @vitest-environment jsdom` per-file directive at the top, plus `cleanup()` in `afterEach`. See `app/src/components/FileCard.test.tsx` for the pattern.
- **File-size rule:** split files past ~400 lines.
- **Conventional Commits** (`feat:`, `test:`, `fix:`, `chore:`).
- **Run `npm test` from `app/` before each commit.**
- **No pushing or PR until Task 7.**

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `app/src/lib/neighbors.ts` | **Create** | `NeighborContext` type, `parseFromParam`, `getNeighbors` |
| `app/src/lib/neighbors.test.ts` | **Create** | Unit tests for `parseFromParam` |
| `app/src/lib/neighbors.integration.test.ts` | **Create** | Testcontainers integration tests for `getNeighbors` (all 5 contexts) |
| `app/src/components/PrevNextNav.tsx` | **Create** | Server component — two anchors with disabled state |
| `app/src/components/PrevNextNav.module.css` | **Create** | Styles matching the design system |
| `app/src/components/PrevNextNav.test.tsx` | **Create** | Component tests |
| `app/src/components/PrevNextKeys.tsx` | **Create** | `"use client"` keyboard hook |
| `app/src/components/PrevNextKeys.test.tsx` | **Create** | Component tests |
| `app/src/components/FileCard.tsx` | **Modify** | Accept optional `fromQuery?: string`, append `?${fromQuery}` to href |
| `app/src/app/(shell)/d/[id]/page.tsx` | **Modify** | Pass `fromQuery={`from=folder/${folder.id}`}` to `<FileCard>` |
| `app/src/app/(shell)/recent/page.tsx` | **Modify** | Pass `fromQuery="from=recent"` |
| `app/src/app/(shell)/mine/page.tsx` | **Modify** | Pass `fromQuery="from=mine"` |
| `app/src/app/(shell)/starred/page.tsx` | **Modify** | Pass `fromQuery="from=starred"` |
| `app/src/app/(shell)/page.tsx` (home) | **Modify** | Pass `fromQuery={tagId ? `from=tagged&tag=${tagId}` : undefined}` only when filter active |
| `app/src/app/(shell)/f/[id]/page.tsx` | **Modify** | Parse `from`/`tag` searchParams, fetch neighbors, render `<PrevNextNav>` + `<PrevNextKeys>` |

`RecentStrip` (used on home) intentionally does NOT pass `fromQuery`. Clicks from the recent strip behave like other home clicks (no prev/next), per spec.

---

## Task 1: Branch + `parseFromParam` (URL → context)

**Files:**
- Create: `app/src/lib/neighbors.ts`
- Create: `app/src/lib/neighbors.test.ts`

- [ ] **Step 1: Create the feature branch from latest main**

```bash
cd /root/vorevault
git checkout main
git pull origin main
git checkout -b feat/prev-next-file-nav
```

- [ ] **Step 2: Create the stub `neighbors.ts` so the test can import it**

Create `app/src/lib/neighbors.ts`:

```ts
export type NeighborContext =
  | { kind: "folder"; folderId: string }
  | { kind: "recent" }
  | { kind: "mine"; uploaderId: string }
  | { kind: "starred"; userId: string }
  | { kind: "tagged"; tagId: string };

/**
 * Parse the `from`/`tag` searchParams from the file-detail URL into a
 * NeighborContext. Returns null for missing or malformed input — the page
 * uses null to mean "do not render the prev/next row."
 *
 * `userId` is the current viewer's id (from the session). It's needed to
 * resolve `from=mine` and `from=starred` server-side.
 */
export function parseFromParam(
  _from: string | undefined,
  _tag: string | undefined,
  _userId: string,
): NeighborContext | null {
  throw new Error("not implemented");
}
```

- [ ] **Step 3: Write the failing tests**

Create `app/src/lib/neighbors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseFromParam } from "./neighbors";

const VIEWER = "11111111-1111-4111-8111-111111111111";
const FOLDER = "22222222-2222-4222-8222-222222222222";
const TAG    = "33333333-3333-4333-8333-333333333333";

describe("parseFromParam", () => {
  it("returns null when from is missing", () => {
    expect(parseFromParam(undefined, undefined, VIEWER)).toBeNull();
  });

  it("returns null when from is empty string", () => {
    expect(parseFromParam("", undefined, VIEWER)).toBeNull();
  });

  it("parses from=recent", () => {
    expect(parseFromParam("recent", undefined, VIEWER)).toEqual({ kind: "recent" });
  });

  it("parses from=mine using the viewer's userId", () => {
    expect(parseFromParam("mine", undefined, VIEWER)).toEqual({
      kind: "mine",
      uploaderId: VIEWER,
    });
  });

  it("parses from=starred using the viewer's userId", () => {
    expect(parseFromParam("starred", undefined, VIEWER)).toEqual({
      kind: "starred",
      userId: VIEWER,
    });
  });

  it("parses from=folder/<uuid>", () => {
    expect(parseFromParam(`folder/${FOLDER}`, undefined, VIEWER)).toEqual({
      kind: "folder",
      folderId: FOLDER,
    });
  });

  it("returns null when from=folder/ has no uuid", () => {
    expect(parseFromParam("folder/", undefined, VIEWER)).toBeNull();
  });

  it("returns null when from=folder/<not-a-uuid>", () => {
    expect(parseFromParam("folder/not-a-uuid", undefined, VIEWER)).toBeNull();
  });

  it("parses from=tagged with tag=<uuid>", () => {
    expect(parseFromParam("tagged", TAG, VIEWER)).toEqual({
      kind: "tagged",
      tagId: TAG,
    });
  });

  it("returns null when from=tagged but tag is missing", () => {
    expect(parseFromParam("tagged", undefined, VIEWER)).toBeNull();
  });

  it("returns null when from=tagged but tag is not a uuid", () => {
    expect(parseFromParam("tagged", "not-a-uuid", VIEWER)).toBeNull();
  });

  it("returns null for unknown from values", () => {
    expect(parseFromParam("trash", undefined, VIEWER)).toBeNull();
    expect(parseFromParam("search", undefined, VIEWER)).toBeNull();
    expect(parseFromParam("xyzzy", undefined, VIEWER)).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests and confirm they all fail with "not implemented"**

```bash
cd /root/vorevault/app
npm test -- src/lib/neighbors.test.ts
```

Expected: 12 failing tests, all throwing `Error: not implemented`.

- [ ] **Step 5: Implement `parseFromParam`**

Replace the stub in `app/src/lib/neighbors.ts` with the real implementation. Keep the `NeighborContext` type unchanged.

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOLDER_PREFIX = "folder/";

export function parseFromParam(
  from: string | undefined,
  tag: string | undefined,
  userId: string,
): NeighborContext | null {
  if (!from) return null;

  if (from === "recent") return { kind: "recent" };
  if (from === "mine") return { kind: "mine", uploaderId: userId };
  if (from === "starred") return { kind: "starred", userId };

  if (from === "tagged") {
    if (!tag || !UUID_RE.test(tag)) return null;
    return { kind: "tagged", tagId: tag };
  }

  if (from.startsWith(FOLDER_PREFIX)) {
    const folderId = from.slice(FOLDER_PREFIX.length);
    if (!UUID_RE.test(folderId)) return null;
    return { kind: "folder", folderId };
  }

  return null;
}
```

- [ ] **Step 6: Run tests and confirm all 12 pass**

```bash
cd /root/vorevault/app
npm test -- src/lib/neighbors.test.ts
```

Expected: 12 passed.

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault
git add app/src/lib/neighbors.ts app/src/lib/neighbors.test.ts
git commit -m "feat(neighbors): parseFromParam URL→context parser with unit tests"
```

---

## Task 2: `getNeighbors` for folder context + integration test

**Files:**
- Modify: `app/src/lib/neighbors.ts`
- Create: `app/src/lib/neighbors.integration.test.ts`

- [ ] **Step 1: Add the `Neighbors` type and `getNeighbors` stub to `neighbors.ts`**

Append to `app/src/lib/neighbors.ts`:

```ts
import { pool } from "@/lib/db";

export type Neighbors = {
  prev: { id: string } | null;
  next: { id: string } | null;
};

/**
 * Resolve the prev (visually-earlier-in-grid) and next (visually-later)
 * file ids for `currentFileId` within `ctx`. Returns null on each side at
 * the boundary. Single round-trip per side; uses `(created_at, id)` as a
 * deterministic tie-breaker so files sharing a timestamp resolve uniquely.
 */
export async function getNeighbors(
  currentFileId: string,
  ctx: NeighborContext,
): Promise<Neighbors> {
  if (ctx.kind === "folder") {
    return getFolderNeighbors(currentFileId, ctx.folderId);
  }
  throw new Error(`getNeighbors: ${ctx.kind} not yet implemented`);
}

async function getFolderNeighbors(
  currentFileId: string,
  folderId: string,
): Promise<Neighbors> {
  // Grid order is `created_at DESC`. "prev" walks toward newer (larger
  // created_at); "next" walks toward older (smaller created_at). We embed
  // the cursor lookup in the query so the caller only needs to pass the
  // current file's id.
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id
    FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.folder_id = $2
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC
    LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id
    FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.folder_id = $2
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT 1
  `;
  const [prevR, nextR] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId, folderId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId, folderId]),
  ]);
  return {
    prev: prevR.rows[0] ?? null,
    next: nextR.rows[0] ?? null,
  };
}
```

- [ ] **Step 2: Create the integration test file**

Create `app/src/lib/neighbors.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { getNeighbors } from "./neighbors";

let fx: PgFixture;
let userId: string;
let folderId: string;
let fileIds: string[] = []; // newest → oldest in this folder

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("@/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });

  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-nbr','alice') RETURNING id`,
  )).rows[0].id;

  folderId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by) VALUES ('Apex', NULL, $1) RETURNING id`,
    [userId],
  )).rows[0].id;

  // Insert 5 files into the folder with explicit, monotonically-increasing
  // created_at so the grid order is fully deterministic.
  // file 0 = oldest, file 4 = newest.
  for (let i = 0; i < 5; i++) {
    const ts = `2026-04-01T00:00:0${i}Z`;
    const r = await fx.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, $2, $3, 'video/mp4', 1, '/x', $4) RETURNING id`,
      [userId, folderId, `clip-${i}.mp4`, ts],
    );
    fileIds.push(r.rows[0].id);
  }
  // Grid sorts created_at DESC, so the visible order is: file 4, 3, 2, 1, 0.
}, 120_000);

afterAll(async () => { await stopPg(fx); });

describe("getNeighbors — folder context", () => {
  it("middle file: prev = the next-newer file, next = the next-older file", async () => {
    // file index 2 in the array; visible position is the 3rd in [4,3,2,1,0].
    const r = await getNeighbors(fileIds[2], { kind: "folder", folderId });
    expect(r.prev?.id).toBe(fileIds[3]);
    expect(r.next?.id).toBe(fileIds[1]);
  });

  it("newest file (visually first): prev = null, next = next-older", async () => {
    const r = await getNeighbors(fileIds[4], { kind: "folder", folderId });
    expect(r.prev).toBeNull();
    expect(r.next?.id).toBe(fileIds[3]);
  });

  it("oldest file (visually last): prev = next-newer, next = null", async () => {
    const r = await getNeighbors(fileIds[0], { kind: "folder", folderId });
    expect(r.prev?.id).toBe(fileIds[1]);
    expect(r.next).toBeNull();
  });

  it("ignores soft-deleted files", async () => {
    // Soft-delete fileIds[3] (the file directly newer than fileIds[2]).
    await fx.pool.query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [fileIds[3]]);
    const r = await getNeighbors(fileIds[2], { kind: "folder", folderId });
    expect(r.prev?.id).toBe(fileIds[4]); // jumps over the deleted one
    expect(r.next?.id).toBe(fileIds[1]);
    // Restore for later tests:
    await fx.pool.query(`UPDATE files SET deleted_at = NULL WHERE id = $1`, [fileIds[3]]);
  });

  it("uses id as a deterministic tie-breaker for identical timestamps", async () => {
    // Insert two files at the exact same created_at and verify ordering by id.
    const sameTs = "2026-04-02T00:00:00Z";
    const a = await fx.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, $2, 'tie-a.mp4', 'video/mp4', 1, '/x', $3) RETURNING id`,
      [userId, folderId, sameTs],
    );
    const b = await fx.pool.query<{ id: string }>(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, $2, 'tie-b.mp4', 'video/mp4', 1, '/x', $3) RETURNING id`,
      [userId, folderId, sameTs],
    );
    const aId = a.rows[0].id, bId = b.rows[0].id;
    // The one with the LARGER id is "earlier" in DESC order; smaller id is "later".
    const [largerId, smallerId] = aId > bId ? [aId, bId] : [bId, aId];
    const r = await getNeighbors(largerId, { kind: "folder", folderId });
    // From the larger-id of the tie, the next neighbor is the smaller-id of the tie.
    expect(r.next?.id).toBe(smallerId);
    // Cleanup so other tests aren't perturbed:
    await fx.pool.query(`DELETE FROM files WHERE id = ANY($1)`, [[aId, bId]]);
  });
});
```

- [ ] **Step 3: Run integration tests**

```bash
cd /root/vorevault/app
npm test -- src/lib/neighbors.integration.test.ts
```

Expected: in this dev environment without Docker, the file may skip via a `beforeAll` throw — that is the established project pattern (see `files.topLevel.integration.test.ts`). The CI will run them for real. If the test runs and any assertion fails, fix the implementation, not the test.

- [ ] **Step 4: Run the full test suite to make sure nothing else broke**

```bash
cd /root/vorevault/app
npm test
```

Expected: full suite green except known testcontainers/Docker-unavailable skips and the pre-existing `thumbnails.test.ts > generates a JPEG thumbnail from a video` ffprobe failure.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/lib/neighbors.ts app/src/lib/neighbors.integration.test.ts
git commit -m "feat(neighbors): getNeighbors for folder context + integration tests"
```

---

## Task 3: Add `recent`, `mine`, `starred`, `tagged` contexts to `getNeighbors`

**Files:**
- Modify: `app/src/lib/neighbors.ts`
- Modify: `app/src/lib/neighbors.integration.test.ts`

- [ ] **Step 1: Replace the `getNeighbors` body with the full dispatch**

In `app/src/lib/neighbors.ts`, replace the existing `getNeighbors` function with:

```ts
export async function getNeighbors(
  currentFileId: string,
  ctx: NeighborContext,
): Promise<Neighbors> {
  switch (ctx.kind) {
    case "folder":  return getFolderNeighbors(currentFileId, ctx.folderId);
    case "recent":  return getRecentNeighbors(currentFileId);
    case "mine":    return getMineNeighbors(currentFileId, ctx.uploaderId);
    case "starred": return getStarredNeighbors(currentFileId, ctx.userId);
    case "tagged":  return getTaggedNeighbors(currentFileId, ctx.tagId);
  }
}
```

- [ ] **Step 2: Add the four new private helpers**

Append to `app/src/lib/neighbors.ts`:

```ts
async function getRecentNeighbors(currentFileId: string): Promise<Neighbors> {
  // /recent walks all top-level files (folder_id IS NULL).
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.folder_id IS NULL
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.folder_id IS NULL
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}

async function getMineNeighbors(currentFileId: string, uploaderId: string): Promise<Neighbors> {
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.uploader_id = $2
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f, cur
    WHERE f.deleted_at IS NULL
      AND f.uploader_id = $2
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId, uploaderId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId, uploaderId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}

async function getStarredNeighbors(currentFileId: string, userId: string): Promise<Neighbors> {
  // /starred orders by BOOKMARK created_at, not file created_at.
  // The cursor is the bookmark for (userId, currentFileId).
  const PREV_SQL = `
    WITH cur AS (
      SELECT created_at FROM bookmarks WHERE user_id = $1 AND file_id = $2
    )
    SELECT b.file_id AS id FROM bookmarks b, cur
    WHERE b.user_id = $1
      AND (b.created_at > cur.created_at
           OR (b.created_at = cur.created_at AND b.file_id > $2))
    ORDER BY b.created_at ASC, b.file_id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (
      SELECT created_at FROM bookmarks WHERE user_id = $1 AND file_id = $2
    )
    SELECT b.file_id AS id FROM bookmarks b, cur
    WHERE b.user_id = $1
      AND (b.created_at < cur.created_at
           OR (b.created_at = cur.created_at AND b.file_id < $2))
    ORDER BY b.created_at DESC, b.file_id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [userId, currentFileId]),
    pool.query<{ id: string }>(NEXT_SQL, [userId, currentFileId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}

async function getTaggedNeighbors(currentFileId: string, tagId: string): Promise<Neighbors> {
  // Walks files carrying the given tag, ordered by file created_at DESC.
  const PREV_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f
    JOIN file_tags ft ON ft.file_id = f.id, cur
    WHERE f.deleted_at IS NULL
      AND ft.tag_id = $2
      AND (f.created_at > cur.created_at
           OR (f.created_at = cur.created_at AND f.id > $1))
    ORDER BY f.created_at ASC, f.id ASC LIMIT 1
  `;
  const NEXT_SQL = `
    WITH cur AS (SELECT created_at FROM files WHERE id = $1)
    SELECT f.id FROM files f
    JOIN file_tags ft ON ft.file_id = f.id, cur
    WHERE f.deleted_at IS NULL
      AND ft.tag_id = $2
      AND (f.created_at < cur.created_at
           OR (f.created_at = cur.created_at AND f.id < $1))
    ORDER BY f.created_at DESC, f.id DESC LIMIT 1
  `;
  const [p, n] = await Promise.all([
    pool.query<{ id: string }>(PREV_SQL, [currentFileId, tagId]),
    pool.query<{ id: string }>(NEXT_SQL, [currentFileId, tagId]),
  ]);
  return { prev: p.rows[0] ?? null, next: n.rows[0] ?? null };
}
```

- [ ] **Step 3: Extend the integration test file with one happy-path test per new context**

Append the following to `app/src/lib/neighbors.integration.test.ts`, INSIDE the existing `describe("getNeighbors — folder context", ...)` block? No — add new `describe` blocks AFTER the existing one. The shared `beforeAll` already inserted the folder-context fixtures; we'll add fixtures for the other contexts in their own setup paths.

Add the following after the existing `describe(...)` block (still in the same file):

```ts
describe("getNeighbors — recent context", () => {
  let topIds: string[] = []; // newest → oldest, all top-level (folder_id NULL)
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      const ts = `2026-04-10T00:00:0${i}Z`;
      const r = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', $3) RETURNING id`,
        [userId, `top-${i}.mp4`, ts],
      );
      topIds.push(r.rows[0].id);
    }
  });

  it("excludes files inside a folder", async () => {
    // The folder fixtures from the previous describe have folder_id set;
    // recent should never see them.
    const r = await getNeighbors(topIds[1], { kind: "recent" });
    expect(r.prev?.id).toBe(topIds[2]);
    expect(r.next?.id).toBe(topIds[0]);
  });

  it("returns null at boundaries", async () => {
    expect((await getNeighbors(topIds[2], { kind: "recent" })).prev).toBeNull();
    expect((await getNeighbors(topIds[0], { kind: "recent" })).next).toBeNull();
  });
});

describe("getNeighbors — mine context", () => {
  let otherUserId: string;
  let mineIds: string[] = [];
  beforeAll(async () => {
    otherUserId = (await fx.pool.query<{ id: string }>(
      `INSERT INTO users (discord_id, username) VALUES ('d-nbr-other','bob') RETURNING id`,
    )).rows[0].id;
    // 2 files by alice (existing userId), 1 by bob, all top-level
    for (let i = 0; i < 2; i++) {
      const ts = `2026-04-15T00:00:0${i}Z`;
      const r = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', $3) RETURNING id`,
        [userId, `mine-${i}.mp4`, ts],
      );
      mineIds.push(r.rows[0].id);
    }
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, NULL, 'bobs.mp4', 'video/mp4', 1, '/x', '2026-04-15T00:00:00.5Z')`,
      [otherUserId],
    );
  });

  it("only walks files uploaded by uploaderId, skipping others' files", async () => {
    // mineIds[0] is older, mineIds[1] is newer; bob's file is in between by timestamp.
    const r = await getNeighbors(mineIds[1], { kind: "mine", uploaderId: userId });
    expect(r.prev).toBeNull();
    expect(r.next?.id).toBe(mineIds[0]); // jumps over bob's file
  });
});

describe("getNeighbors — starred context", () => {
  let starredFileIds: string[] = [];
  beforeAll(async () => {
    // Three files (any folder), bookmarked by alice in a controlled order.
    for (let i = 0; i < 3; i++) {
      const r = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', '2026-04-20T00:00:00Z') RETURNING id`,
        [userId, `star-${i}.mp4`],
      );
      starredFileIds.push(r.rows[0].id);
    }
    // Bookmark them in order: index 0 first (oldest bookmark), 2 last (newest).
    for (let i = 0; i < 3; i++) {
      const ts = `2026-04-21T00:00:0${i}Z`;
      await fx.pool.query(
        `INSERT INTO bookmarks (user_id, file_id, created_at) VALUES ($1, $2, $3)`,
        [userId, starredFileIds[i], ts],
      );
    }
    // Visible /starred order: starredFileIds[2], [1], [0] (newest bookmark first).
  });

  it("orders by bookmark created_at, not file created_at", async () => {
    const r = await getNeighbors(starredFileIds[1], { kind: "starred", userId });
    expect(r.prev?.id).toBe(starredFileIds[2]); // newer bookmark
    expect(r.next?.id).toBe(starredFileIds[0]); // older bookmark
  });
});

describe("getNeighbors — tagged context", () => {
  let tagId: string;
  let taggedIds: string[] = [];
  beforeAll(async () => {
    tagId = (await fx.pool.query<{ id: string }>(
      `INSERT INTO tags (name) VALUES ('apex') RETURNING id`,
    )).rows[0].id;
    for (let i = 0; i < 3; i++) {
      const ts = `2026-04-22T00:00:0${i}Z`;
      const f = await fx.pool.query<{ id: string }>(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, NULL, $2, 'video/mp4', 1, '/x', $3) RETURNING id`,
        [userId, `tag-${i}.mp4`, ts],
      );
      taggedIds.push(f.rows[0].id);
      await fx.pool.query(
        `INSERT INTO file_tags (file_id, tag_id, created_by) VALUES ($1, $2, $3)`,
        [f.rows[0].id, tagId, userId],
      );
    }
    // Insert one untagged file in the middle of the timestamp range — it
    // should be skipped by the tagged neighbor query.
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
       VALUES ($1, NULL, 'untagged.mp4', 'video/mp4', 1, '/x', '2026-04-22T00:00:00.5Z')`,
      [userId],
    );
  });

  it("walks only files with the given tag, in created_at DESC order", async () => {
    // taggedIds: [oldest, mid, newest] visually rendered as [newest, mid, oldest].
    const r = await getNeighbors(taggedIds[1], { kind: "tagged", tagId });
    expect(r.prev?.id).toBe(taggedIds[2]); // newer
    expect(r.next?.id).toBe(taggedIds[0]); // older — skips the untagged file
  });
});
```

- [ ] **Step 4: Run integration tests**

```bash
cd /root/vorevault/app
npm test -- src/lib/neighbors.integration.test.ts
```

Expected: file skips locally without Docker (per project pattern); CI will exercise it.

- [ ] **Step 5: Run the full test suite**

```bash
cd /root/vorevault/app
npm test
```

Expected: same green-except-environmental-skips state as before.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault
git add app/src/lib/neighbors.ts app/src/lib/neighbors.integration.test.ts
git commit -m "feat(neighbors): support recent/mine/starred/tagged contexts"
```

---

## Task 4: `PrevNextNav` server component + tests

**Files:**
- Create: `app/src/components/PrevNextNav.tsx`
- Create: `app/src/components/PrevNextNav.module.css`
- Create: `app/src/components/PrevNextNav.test.tsx`

- [ ] **Step 1: Create the component**

Create `app/src/components/PrevNextNav.tsx`:

```tsx
import styles from "./PrevNextNav.module.css";

type Neighbor = { id: string } | null;

export function PrevNextNav({
  prev,
  next,
  fromQuery,
}: {
  prev: Neighbor;
  next: Neighbor;
  fromQuery: string; // e.g. "from=folder/abc-123" — appended verbatim
}) {
  return (
    <nav className={styles.row} aria-label="prev/next file">
      {prev ? (
        <a href={`/f/${prev.id}?${fromQuery}`} className={styles.button}>← prev</a>
      ) : (
        <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">← prev</span>
      )}
      {next ? (
        <a href={`/f/${next.id}?${fromQuery}`} className={styles.button}>next →</a>
      ) : (
        <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">next →</span>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Create the styles**

Create `app/src/components/PrevNextNav.module.css`:

```css
.row {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 0 32px;
  margin-top: 4px;
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  color: var(--vv-accent);
  background: var(--vv-bg);
  border: 2px solid var(--vv-ink);
  border-radius: var(--vv-radius-sm);
  box-shadow: 3px 3px 0 var(--vv-ink);
  text-decoration: none;
  cursor: pointer;
  transition: transform 60ms ease, box-shadow 60ms ease;
}

.button:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 var(--vv-ink);
}

.button:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--vv-ink);
}

.disabled {
  color: var(--vv-ink-muted);
  background: var(--vv-bg-sunken);
  box-shadow: none;
  cursor: default;
  pointer-events: none;
}

.disabled:hover {
  transform: none;
  box-shadow: none;
}

@media (max-width: 820px) {
  .row {
    padding: 0 16px;
  }
  .button {
    padding: 6px 10px;
    font-size: 12px;
  }
}
```

- [ ] **Step 3: Write tests**

Create `app/src/components/PrevNextNav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PrevNextNav } from "./PrevNextNav";

afterEach(() => cleanup());

describe("PrevNextNav", () => {
  it("renders both as anchors with correct hrefs when both neighbors exist", () => {
    render(
      <PrevNextNav
        prev={{ id: "prev-id" }}
        next={{ id: "next-id" }}
        fromQuery="from=folder/abc"
      />
    );
    const prev = screen.getByText("← prev");
    const next = screen.getByText("next →");
    expect(prev.tagName).toBe("A");
    expect(prev).toHaveAttribute("href", "/f/prev-id?from=folder/abc");
    expect(next.tagName).toBe("A");
    expect(next).toHaveAttribute("href", "/f/next-id?from=folder/abc");
  });

  it("renders prev as disabled span when prev is null", () => {
    render(<PrevNextNav prev={null} next={{ id: "n" }} fromQuery="from=recent" />);
    const prev = screen.getByText("← prev");
    expect(prev.tagName).toBe("SPAN");
    expect(prev).toHaveAttribute("aria-disabled", "true");
  });

  it("renders next as disabled span when next is null", () => {
    render(<PrevNextNav prev={{ id: "p" }} next={null} fromQuery="from=recent" />);
    const next = screen.getByText("next →");
    expect(next.tagName).toBe("SPAN");
    expect(next).toHaveAttribute("aria-disabled", "true");
  });

  it("renders both as disabled spans when both are null", () => {
    render(<PrevNextNav prev={null} next={null} fromQuery="from=recent" />);
    expect(screen.getByText("← prev").tagName).toBe("SPAN");
    expect(screen.getByText("next →").tagName).toBe("SPAN");
  });

  it("preserves the full fromQuery (with & for tagged context)", () => {
    render(
      <PrevNextNav
        prev={{ id: "p" }}
        next={null}
        fromQuery="from=tagged&tag=tag-uuid"
      />
    );
    expect(screen.getByText("← prev")).toHaveAttribute(
      "href",
      "/f/p?from=tagged&tag=tag-uuid",
    );
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
cd /root/vorevault/app
npm test -- src/components/PrevNextNav.test.tsx
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault
git add app/src/components/PrevNextNav.tsx app/src/components/PrevNextNav.module.css app/src/components/PrevNextNav.test.tsx
git commit -m "feat(prev-next): PrevNextNav server component"
```

---

## Task 5: `PrevNextKeys` client component + tests

**Files:**
- Create: `app/src/components/PrevNextKeys.tsx`
- Create: `app/src/components/PrevNextKeys.test.tsx`

- [ ] **Step 1: Create the component**

Create `app/src/components/PrevNextKeys.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Neighbor = { id: string } | null;

export function PrevNextKeys({
  prev,
  next,
  fromQuery,
}: {
  prev: Neighbor;
  next: Neighbor;
  fromQuery: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.push(`/f/${prev.id}?${fromQuery}`);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.push(`/f/${next.id}?${fromQuery}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, fromQuery, router]);

  return null;
}
```

- [ ] **Step 2: Write tests**

Create `app/src/components/PrevNextKeys.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { PrevNextKeys } from "./PrevNextKeys";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

beforeEach(() => { pushMock.mockClear(); });
afterEach(() => cleanup());

describe("PrevNextKeys", () => {
  it("ArrowRight navigates to next when next is set", () => {
    render(<PrevNextKeys prev={null} next={{ id: "n-id" }} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(pushMock).toHaveBeenCalledWith("/f/n-id?from=recent");
  });

  it("ArrowLeft navigates to prev when prev is set", () => {
    render(<PrevNextKeys prev={{ id: "p-id" }} next={null} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(pushMock).toHaveBeenCalledWith("/f/p-id?from=recent");
  });

  it("does nothing when corresponding neighbor is null", () => {
    render(<PrevNextKeys prev={null} next={null} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("ignores key when target is an input", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(pushMock).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores key when target is a textarea", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    fireEvent.keyDown(ta, { key: "ArrowRight" });
    expect(pushMock).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it("ignores when a modifier key is held", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("ignores keys other than ArrowLeft / ArrowRight", () => {
    render(<PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("removes its event listener on unmount", () => {
    const { unmount } = render(
      <PrevNextKeys prev={{ id: "p" }} next={{ id: "n" }} fromQuery="from=recent" />,
    );
    unmount();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault/app
npm test -- src/components/PrevNextKeys.test.tsx
```

Expected: 8 passed.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault
git add app/src/components/PrevNextKeys.tsx app/src/components/PrevNextKeys.test.tsx
git commit -m "feat(prev-next): PrevNextKeys keyboard hook"
```

---

## Task 6: Wire FileCard `fromQuery` prop + grids + file detail page

**Files:**
- Modify: `app/src/components/FileCard.tsx`
- Modify: `app/src/app/(shell)/d/[id]/page.tsx`
- Modify: `app/src/app/(shell)/recent/page.tsx`
- Modify: `app/src/app/(shell)/mine/page.tsx`
- Modify: `app/src/app/(shell)/starred/page.tsx`
- Modify: `app/src/app/(shell)/page.tsx` (home)
- Modify: `app/src/app/(shell)/f/[id]/page.tsx`

### Step 6.1: Add `fromQuery` prop to `FileCard`

- [ ] **Step 1: Modify the props type and href construction**

In `app/src/components/FileCard.tsx`:

Change the function signature from:
```tsx
export function FileCard({
  file,
  isShared,
}: {
  file: FileWithUploader;
  isShared?: boolean;
}) {
```
to:
```tsx
export function FileCard({
  file,
  isShared,
  fromQuery,
}: {
  file: FileWithUploader;
  isShared?: boolean;
  fromQuery?: string;
}) {
```

Change the anchor href line (currently: `<a href={`/f/${file.id}`} ...>`) to:

```tsx
<a href={fromQuery ? `/f/${file.id}?${fromQuery}` : `/f/${file.id}`} className={className} onClick={handleClick} draggable={canManage} onDragStart={handleDragStart} onDragEnd={handleDragEnd} aria-pressed={selected} data-nav-item data-nav-descriptor={JSON.stringify(descriptor)} tabIndex={0}>
```

- [ ] **Step 2: Run existing FileCard tests to confirm nothing broke**

```bash
cd /root/vorevault/app
npm test -- src/components/FileCard.test.tsx
```

Expected: same pass count as before (the prop is optional).

### Step 6.2: Pass `fromQuery` from each grid

- [ ] **Step 3: Folder detail (`/d/[id]`)**

In `app/src/app/(shell)/d/[id]/page.tsx`, find the line that renders `<FileCard ...>` for files inside a folder. Change it to pass:

```tsx
<FileCard key={`x-${f.id}`} file={f} fromQuery={`from=folder/${folder.id}`} />
```

(Match whatever the existing key/prop pattern is — only add `fromQuery`.)

- [ ] **Step 4: Recent (`/recent`)**

In `app/src/app/(shell)/recent/page.tsx`, change the FileCard line to:

```tsx
<FileCard key={`x-${it.id}`} file={it} fromQuery="from=recent" />
```

(The existing code only emits FileCard for `it.kind === "file"`, so this only applies in that branch.)

- [ ] **Step 5: Mine (`/mine`)**

In `app/src/app/(shell)/mine/page.tsx`, change the FileCard line to:

```tsx
<FileCard key={f.id} file={f} fromQuery="from=mine" />
```

- [ ] **Step 6: Starred (`/starred`)**

In `app/src/app/(shell)/starred/page.tsx`, change the FileCard line to:

```tsx
<FileCard key={b.file.id} file={b.file} fromQuery="from=starred" />
```

- [ ] **Step 7: Home (`/`) — only when filter is active**

In `app/src/app/(shell)/page.tsx`, find where the all-files grid renders `<FileCard>`. Pass the `fromQuery` only when `tagId` is set:

```tsx
<FileCard
  key={`x-${item.id}`}
  file={item}
  fromQuery={tagId ? `from=tagged&tag=${tagId}` : undefined}
/>
```

(Match existing prop names; only add `fromQuery`.)

The home page also renders a `RecentStrip` and a folder grid — do NOT add `fromQuery` to those. Only the all-files paginated grid gets it, and only when filtered.

### Step 6.3: Wire the file detail page

- [ ] **Step 8: Add imports**

In `app/src/app/(shell)/f/[id]/page.tsx`, add these imports next to the other `@/lib` and `@/components` imports:

```ts
import { parseFromParam, getNeighbors } from "@/lib/neighbors";
import { PrevNextNav } from "@/components/PrevNextNav";
import { PrevNextKeys } from "@/components/PrevNextKeys";
```

- [ ] **Step 9: Read searchParams**

Change the `Props` type and the function signature from:

```ts
type Props = { params: Promise<{ id: string }> };

export default async function FilePage({ params }: Props) {
```

to:

```ts
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; tag?: string }>;
};

export default async function FilePage({ params, searchParams }: Props) {
```

- [ ] **Step 10: Parse the context and fetch neighbors**

After the existing `Promise.all` for breadcrumbs/bookmarked/tags (around line 47), add:

```ts
  const sp = await searchParams;
  const ctx = parseFromParam(sp.from, sp.tag, user.id);
  const neighbors = ctx ? await getNeighbors(file.id, ctx) : null;
  // Build the verbatim from-query suffix to preserve across prev/next links.
  // We only build this when ctx is non-null so the components don't render at all otherwise.
  const fromQuery = ctx
    ? (sp.from === "tagged" ? `from=tagged&tag=${sp.tag}` : `from=${sp.from}`)
    : "";
```

- [ ] **Step 11: Render the components**

Inside the existing top-level fragment, immediately after the back-link `<div className={styles.back}>...</div>` and the optional `<Breadcrumbs ...>` row (around line 65), add:

```tsx
      {neighbors && (
        <>
          <PrevNextNav prev={neighbors.prev} next={neighbors.next} fromQuery={fromQuery} />
          <PrevNextKeys prev={neighbors.prev} next={neighbors.next} fromQuery={fromQuery} />
        </>
      )}
```

So the top of the `return` block ends up looking like:

```tsx
  return (
    <>
      <div className={styles.back}><a href={back.href}>← {back.label}</a></div>
      {breadcrumbs.length > 0 && (
        <Breadcrumbs crumbs={breadcrumbs.map(f => ({ id: f.id, name: f.name }))} />
      )}

      {neighbors && (
        <>
          <PrevNextNav prev={neighbors.prev} next={neighbors.next} fromQuery={fromQuery} />
          <PrevNextKeys prev={neighbors.prev} next={neighbors.next} fromQuery={fromQuery} />
        </>
      )}

      <div className={styles.content}>
        ...
```

- [ ] **Step 12: Build + full test suite**

```bash
cd /root/vorevault/app
npm run build
npm test
```

Expected: build succeeds with no type errors. Test suite green except for known environmental skips.

- [ ] **Step 13: Commit**

```bash
cd /root/vorevault
git add app/src/components/FileCard.tsx \
  app/src/app/\(shell\)/d/\[id\]/page.tsx \
  app/src/app/\(shell\)/recent/page.tsx \
  app/src/app/\(shell\)/mine/page.tsx \
  app/src/app/\(shell\)/starred/page.tsx \
  app/src/app/\(shell\)/page.tsx \
  app/src/app/\(shell\)/f/\[id\]/page.tsx
git commit -m "feat(prev-next): wire FileCard, grids, and file detail page"
```

---

## Task 7: Push branch + open PR + smoke test

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
cd /root/vorevault
git push -u origin feat/prev-next-file-nav
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: prev/next file navigation (←/→ keys + buttons)" --body "$(cat <<'EOF'
## Summary
- New helper `app/src/lib/neighbors.ts` exports `parseFromParam` and `getNeighbors`. Five contexts: folder, recent, mine, starred, tagged. Two indexed SQL queries per render with deterministic `(created_at, id)` tie-breaker.
- New `PrevNextNav` (server) and `PrevNextKeys` (client) components. The first renders the two anchors (or disabled spans at boundaries); the second is a tiny window-keydown hook that calls `router.push`.
- `FileCard` accepts an optional `fromQuery` prop that gets appended to the `/f/<id>` href. Each grid (folder, recent, mine, starred, tag-filtered home) passes the appropriate value.
- File detail page parses `?from=` (and optional `?tag=`), fetches neighbors when present, and renders the new components.

## Why
Implements Theme 2.2 from `docs/superpowers/specs/2026-04-25-roadmap-design.md`. Lets users binge files in the current list (folder, recent, mine, starred, or tag-filtered home) with `←/→` keys or on-screen buttons, without bouncing back to the grid between every file.

Spec: `docs/superpowers/specs/2026-04-25-prev-next-file-nav-design.md`
Plan: `docs/superpowers/plans/2026-04-25-prev-next-file-nav.md`

## Test plan
- [x] `parseFromParam` unit tests (12)
- [x] `getNeighbors` integration tests (testcontainers; folder/recent/mine/starred/tagged)
- [x] `PrevNextNav` component tests (anchor vs disabled span, fromQuery preservation)
- [x] `PrevNextKeys` component tests (keys, modifiers, input filter, unmount cleanup)
- [x] `npm run build` succeeds
- [ ] Browser smoke test on production after Watchtower deploy:
  - In a folder: click a file → ←/→ walks within folder, buttons match, boundary disables work
  - Recent / mine / starred: same
  - Home with `?tag=...`: ←/→ stays inside the tag filter
  - Direct link `/f/<id>` (no `from`): no prev/next row rendered
  - Open prev/next link in new tab: works, inherits the same context

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Wait for CI green and merge**

```bash
gh pr view --json state,statusCheckRollup --jq '.statusCheckRollup'
```

When the `ci` check is `SUCCESS`, merge:

```bash
gh pr merge --squash --delete-branch
```

Watchtower auto-pulls within ~4 min of the deploy job completing.

- [ ] **Step 4: Production smoke test**

After Watchtower deploys, visit `https://vault.bullmoosefn.com` and exercise:

1. Open a folder, click any file → confirm `←` and `→` keys jump within the folder. On-screen buttons should match. At first/last file in the folder, the appropriate button should be visually disabled.
2. Open `/recent`, click any file → same checks.
3. Open `/mine`, click any file → same checks; confirm files uploaded by other users are not in the chain.
4. Open `/starred`, click any starred file → same checks; ordering follows the star date, not the file date.
5. Open home with `?tag=<some-tag>`, click a file → ← / → walks only files with that tag. URL shows `?from=tagged&tag=<id>` and stays consistent across hops.
6. Open `/f/<id>` directly (no `from=`) — confirm the prev/next row is not rendered.
7. Right-click a `next →` button → "Open in new tab" should open with the `from=` preserved and the new tab's prev/next still working from the same context.

If anything fails, file a follow-up issue and revert the merge if blocking.
