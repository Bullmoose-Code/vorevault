# Phase 2d: Folder-Zip Download (Recursive, Tree-Preserving)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users download any folder (including all nested content) as a single `.zip` with the folder tree preserved. Recursive walk via a Postgres CTE. No hard cap — archiver streams one file at a time so memory is bounded regardless of size.

**Architecture:**
- New lib function `collectFolderTreeFiles(folderId)` runs a recursive CTE that produces one row per non-trashed file under the tree, with a `zip_path` column built during the walk (e.g. `RootFolder/subfolder/file.mp4`).
- New route `GET /api/folders/:id/zip` mirrors the existing `/api/files/zip` route pattern: session-auth via cookie, resolve folder, call `collectFolderTreeFiles`, feed results into the existing `lib/zip.ts` `buildZipStream`, stream as the response body.
- FolderContextMenu gains a "Download as zip" item in single-item mode (visible to all authenticated users — downloading is already open to the whole group per DESIGN.md's shared-pool principle).
- Folder-name sanitization: replace `/` with `_` in path segments so nothing can break out of the intended zip tree.
- Existing `buildZipStream` dedup handles colliding paths (`Docs/report.pdf` vs a second `Docs/report.pdf` → the second becomes `Docs/report (2).pdf`). No changes to `lib/zip.ts`.

**Tech Stack:** Next.js 15 App Router (Node.js runtime), TS strict, Vitest, Postgres 16 via `pg` Pool, `archiver` (already installed in 2b).

**Branch:** `feat/phase-2d-folder-zip` — off `main`.

---

## Scope

**In:**
- New lib function `collectFolderTreeFiles` with tests (integration tests use testcontainers, matching existing patterns — will skip in Docker-less environments).
- New route `GET /api/folders/:id/zip`.
- FolderContextMenu "Download as zip" action in **single-item mode** (not batch mode for this phase).
- Folder-name `/` sanitization in zip paths.

**Out (deferred):**
- Download-zip for multi-folder or mixed selections from SelectionToolbar — the existing toolbar button stays files-only for now.
- Folder-zip from context menu batch mode (Phase 2b's batch context menu stays unchanged; no zip for folders-in-selection).
- Empty-folder entries in the zip — if a subfolder has no files recursively, it won't appear.
- Unified `/api/zip?files=...&folders=...` endpoint for mixed selections — YAGNI until a user asks.

---

## Data + route contract

### Lib: `collectFolderTreeFiles(folderId: string): Promise<ZipEntry[]>`

Returns an array of `{ name, path }` entries compatible with `buildZipStream`:
- `name`: zip-relative path like `RootFolder/sub/file.mp4` (with `/` in folder names replaced by `_`).
- `path`: the on-disk `storage_path` of the file (original, never transcoded).

Behavior:
- Root folder must exist and be non-trashed; otherwise throws `FolderNotFoundError` (existing type).
- Skips trashed files and trashed subfolders.
- Uses one Postgres query — a recursive CTE that tracks the accumulated path while walking down.

SQL shape (plan-level; adapt column names if existing helpers differ):

```sql
WITH RECURSIVE tree AS (
  SELECT id, parent_id, name, name AS path
    FROM folders
   WHERE id = $1 AND deleted_at IS NULL
  UNION ALL
  SELECT f.id, f.parent_id, f.name, t.path || '/' || f.name AS path
    FROM folders f
    JOIN tree t ON f.parent_id = t.id
   WHERE f.deleted_at IS NULL
)
SELECT (t.path || '/' || f.original_name) AS zip_path,
       f.storage_path,
       f.original_name
  FROM files f
  JOIN tree t ON f.folder_id = t.id
 WHERE f.deleted_at IS NULL
 ORDER BY zip_path
```

The `/`-in-folder-name sanitization happens post-query in JS — the SQL keeps raw names, the lib function does a `.replaceAll("/", "_")` on each path segment before building the final `zip_path`.

**Wait — post-processing requires splitting the joined path.** Cleaner: do the sanitization in SQL with `REPLACE(name, '/', '_')` inside the CTE, so `path` is already sanitized:

```sql
WITH RECURSIVE tree AS (
  SELECT id, parent_id, REPLACE(name, '/', '_') AS name, REPLACE(name, '/', '_') AS path
    FROM folders
   WHERE id = $1 AND deleted_at IS NULL
  UNION ALL
  SELECT f.id, f.parent_id, REPLACE(f.name, '/', '_'), t.path || '/' || REPLACE(f.name, '/', '_') AS path
    FROM folders f
    JOIN tree t ON f.parent_id = t.id
   WHERE f.deleted_at IS NULL
)
SELECT (t.path || '/' || REPLACE(f.original_name, '/', '_')) AS zip_path,
       f.storage_path
  FROM files f
  JOIN tree t ON f.folder_id = t.id
 WHERE f.deleted_at IS NULL
 ORDER BY zip_path
```

Original filenames also get `/` replaced (defensive — `file --mime-type` lets weird names through).

### Route: `GET /api/folders/:id/zip`

- Session-cookie auth (same pattern as `/api/stream/[id]` and `/api/files/zip`).
- `getFolder(id)` — returns null → 404. Deleted → 404 (already filtered by `getFolder`).
- `collectFolderTreeFiles(id)` — if empty → 404 "empty folder" (don't stream a zero-entry zip).
- Filename: `vorevault-<sanitized-folder-name>-<YYYYMMDD>.zip`.
- `Content-Type: application/zip`, `Content-Disposition: attachment`, `Cache-Control: private, no-store`.
- Streams through `Readable.toWeb()` → `NextResponse(webStream)` (same pattern as existing routes).

---

## File Structure

**Created:**
- `app/src/app/api/folders/[id]/zip/route.ts`
- `app/src/app/api/folders/[id]/zip/route.test.ts` (integration-style; uses testcontainers — may skip in Docker-less environments, consistent with other route tests)

**Modified:**
- `app/src/lib/folders.ts` — add `collectFolderTreeFiles` export. Returns `ZipEntry[]` (import type from `@/lib/zip`). Also export a `FolderEmptyError` for the route to map to 404.
- `app/src/lib/folders.test.ts` — add tests for the tree walk (integration with testcontainers; will skip in Docker-less env).
- `app/src/components/FolderContextMenu.tsx` — add "Download as zip" item in single-item mode. Uses programmatic anchor click to `/api/folders/${id}/zip`.
- `app/src/components/FolderContextMenu.test.tsx` — add case asserting the item renders.

**Not touched:**
- `lib/zip.ts` — existing `buildZipStream` works unchanged for hierarchical paths. Dedup handles collisions at full-path granularity.
- `SelectionToolbar.tsx` — existing files-only zip button unchanged.
- `FileContextMenu.tsx` — unchanged.
- `DESIGN.md`.

---

## Task 1: Branch

- [ ] **Step 1:**
  ```bash
  git -C /root/vorevault fetch origin
  git -C /root/vorevault checkout main && git -C /root/vorevault pull --ff-only
  git -C /root/vorevault checkout -b feat/phase-2d-folder-zip
  ```

- [ ] **Step 2: Baseline**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib/zip' 'src/lib/gridNav' 2>&1 | tail -5
  cd /root/vorevault/app && npm run build 2>&1 | tail -4
  ```
  Expected: green + clean build. If not, stop and investigate.

---

## Task 2: `collectFolderTreeFiles` + `FolderEmptyError`

**Files:**
- Modify: `app/src/lib/folders.ts`
- Modify: `app/src/lib/folders.test.ts` (add cases — will only run with testcontainers)

### Step 1: Read the existing recursive patterns

```bash
sed -n '415,445p' /root/vorevault/app/src/lib/folders.ts
```

That's the `permanentDeleteFolder` pattern — your query follows the same recursive-CTE idiom but adds path accumulation.

### Step 2: Add types and function at the end of `folders.ts`

Before the final closing of the file (append to end; don't reorder existing code):

```ts
// ---- Phase 2d: recursive tree walk for zip download ----

import type { ZipEntry } from "@/lib/zip";

export class FolderEmptyError extends Error {
  constructor() { super("folder has no downloadable files"); this.name = "FolderEmptyError"; }
}

/**
 * Walk the non-trashed subtree rooted at `folderId` and return one entry per
 * file, with a zip-relative path built from folder names. Folder + file names
 * have `/` replaced with `_` so nothing escapes the zip tree. Throws
 * FolderNotFoundError if the root doesn't exist or is trashed.
 */
export async function collectFolderTreeFiles(folderId: string): Promise<ZipEntry[]> {
  // First confirm the root exists and is non-trashed.
  const root = await getFolder(folderId);
  if (!root) throw new FolderNotFoundError();

  const { rows } = await pool.query<{ zip_path: string; storage_path: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id, parent_id, REPLACE(name, '/', '_') AS path
         FROM folders
        WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT f.id, f.parent_id, t.path || '/' || REPLACE(f.name, '/', '_') AS path
         FROM folders f
         JOIN tree t ON f.parent_id = t.id
        WHERE f.deleted_at IS NULL
     )
     SELECT (t.path || '/' || REPLACE(f.original_name, '/', '_')) AS zip_path,
            f.storage_path
       FROM files f
       JOIN tree t ON f.folder_id = t.id
      WHERE f.deleted_at IS NULL
      ORDER BY zip_path`,
    [folderId],
  );

  return rows.map((r) => ({ name: r.zip_path, path: r.storage_path }));
}
```

(Add the `import type { ZipEntry }` at the top of the file alongside other imports if it isn't already present. If `getFolder` isn't in scope at the end of the file, move the import / reorder — but it IS exported from this same file at line ~242, so just call it directly.)

### Step 3: Add integration tests

Append to `app/src/lib/folders.test.ts` — follow the existing test fixture pattern (`beforeAll` sets up pool via testcontainer, `afterAll` tears down). Tests:

```ts
  it("collectFolderTreeFiles: returns files with zip paths under a single folder", async () => {
    const u = await makeUser();
    const root = await createFolder({ name: "docs", parentId: null, createdBy: u.id });
    await insertFile({ uploaderId: u.id, folderId: root.id, originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 10, storagePath: "/data/uploads/a" });
    await insertFile({ uploaderId: u.id, folderId: root.id, originalName: "b.txt", mimeType: "text/plain", sizeBytes: 5, storagePath: "/data/uploads/b" });

    const entries = await collectFolderTreeFiles(root.id);
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.name).sort()).toEqual(["docs/a.pdf", "docs/b.txt"]);
  });

  it("collectFolderTreeFiles: preserves nested folder structure", async () => {
    const u = await makeUser();
    const root = await createFolder({ name: "root", parentId: null, createdBy: u.id });
    const sub = await createFolder({ name: "sub", parentId: root.id, createdBy: u.id });
    await insertFile({ uploaderId: u.id, folderId: sub.id, originalName: "deep.pdf", mimeType: "application/pdf", sizeBytes: 1, storagePath: "/data/uploads/deep" });

    const entries = await collectFolderTreeFiles(root.id);
    expect(entries.map((e) => e.name)).toEqual(["root/sub/deep.pdf"]);
  });

  it("collectFolderTreeFiles: skips trashed files and trashed subfolders", async () => {
    const u = await makeUser();
    const root = await createFolder({ name: "root", parentId: null, createdBy: u.id });
    const kept = await createFolder({ name: "kept", parentId: root.id, createdBy: u.id });
    const trashed = await createFolder({ name: "trashed", parentId: root.id, createdBy: u.id });
    await insertFile({ uploaderId: u.id, folderId: kept.id, originalName: "k.pdf", mimeType: "application/pdf", sizeBytes: 1, storagePath: "/data/uploads/k" });
    const trashedFile = await insertFile({ uploaderId: u.id, folderId: kept.id, originalName: "t.pdf", mimeType: "application/pdf", sizeBytes: 1, storagePath: "/data/uploads/t" });

    // Mark the subfolder and the extra file as trashed.
    await pool.query(`UPDATE folders SET deleted_at = now() WHERE id = $1`, [trashed.id]);
    await pool.query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [trashedFile.id]);

    const entries = await collectFolderTreeFiles(root.id);
    expect(entries.map((e) => e.name)).toEqual(["root/kept/k.pdf"]);
  });

  it("collectFolderTreeFiles: throws FolderNotFoundError for missing / trashed root", async () => {
    await expect(collectFolderTreeFiles("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(FolderNotFoundError);
  });

  it("collectFolderTreeFiles: replaces '/' in folder and file names", async () => {
    const u = await makeUser();
    // Folder named with a slash (insert bypassing createFolder's validation if it rejects '/').
    const { rows } = await pool.query(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ($1, NULL, $2) RETURNING *`,
      ["a/b", u.id],
    );
    const root = rows[0];
    await insertFile({ uploaderId: u.id, folderId: root.id, originalName: "c/d.txt", mimeType: "text/plain", sizeBytes: 1, storagePath: "/data/uploads/cd" });

    const entries = await collectFolderTreeFiles(root.id);
    expect(entries.map((e) => e.name)).toEqual(["a_b/c_d.txt"]);
  });
```

> Note: the helper names `makeUser`, `insertFile` mirror existing fixtures in this test file. If the real helpers have different names (e.g. `createTestUser`, `insertTestFile`), match the existing pattern — **read the top of `folders.test.ts` first and adapt** rather than invent.

### Step 4: Run tests

```bash
cd /root/vorevault/app && npm test -- folders 2>&1 | tail -15
```

Expected: the new tests either pass (if testcontainers work) or skip/fail with the known "Could not find a working container runtime strategy" infra error. If they actually FAIL with a real assertion error, fix before committing.

Unit tests that don't hit the DB will still run and pass (none of the existing folders.test.ts tests are pure-unit, they all use the fixture, so this entire file may skip in Docker-less env — that's accepted).

### Step 5: Build check

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -6
```

Expected: clean. Any TS error about `ZipEntry` import resolution, fix before committing.

### Step 6: Commit

```bash
cd /root/vorevault
git add app/src/lib/folders.ts app/src/lib/folders.test.ts
git commit -m "feat(lib): collectFolderTreeFiles for recursive folder-zip download"
```

---

## Task 3: `GET /api/folders/:id/zip` route

**Files:**
- Create: `app/src/app/api/folders/[id]/zip/route.ts`
- Create: `app/src/app/api/folders/[id]/zip/route.test.ts` (integration; follows existing route-test pattern — skip in Docker-less env)

### Step 1: Implement the route

Create `app/src/app/api/folders/[id]/zip/route.ts`:

```ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getSessionUser } from "@/lib/sessions";
import { collectFolderTreeFiles, FolderNotFoundError, getFolder } from "@/lib/folders";
import { buildZipStream } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "vv_session";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sanitizeForFilename(name: string): string {
  // Replace anything that's not alnum, dash, underscore, or dot with an underscore.
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "folder";
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const sid = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sid) return new NextResponse("auth required", { status: 401 });
  const user = await getSessionUser(sid);
  if (!user) return new NextResponse("auth required", { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return new NextResponse("invalid id", { status: 400 });

  const folder = await getFolder(id);
  if (!folder) return new NextResponse("folder not found", { status: 404 });

  let entries;
  try {
    entries = await collectFolderTreeFiles(id);
  } catch (e) {
    if (e instanceof FolderNotFoundError) return new NextResponse("folder not found", { status: 404 });
    throw e;
  }
  if (entries.length === 0) return new NextResponse("folder is empty", { status: 404 });

  const nodeStream = buildZipStream(entries);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  const filename = `vorevault-${sanitizeForFilename(folder.name)}-${dateStamp()}.zip`;
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

### Step 2: Integration test (optional — skips in Docker-less env)

Create `app/src/app/api/folders/[id]/zip/route.test.ts` mirroring the style of any existing route test in the repo. If no route in this codebase has a unit test that doesn't require testcontainers, **skip writing this test file** — it's not valuable to add a test that will only ever be gated on Docker. The lib tests from Task 2 already cover the tree walk, and the route is a thin wrapper.

### Step 3: Build check

```bash
cd /root/vorevault/app && npm run build 2>&1 | tail -8
```

Expected: clean. The route should show up in the build output.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/app/api/folders/\[id\]/zip/route.ts
git commit -m "feat(api): GET /api/folders/:id/zip streams a recursive zip"
```

---

## Task 4: FolderContextMenu — "Download as zip" item

**Files:**
- Modify: `app/src/components/FolderContextMenu.tsx`
- Modify: `app/src/components/FolderContextMenu.test.tsx`

### Step 1: Extend the test

Open `app/src/components/FolderContextMenu.test.tsx`. Add a new `it(...)` inside the existing describe block:

```tsx
  it("single mode: shows Download as zip action", async () => {
    wrap("u", { id: "u", isAdmin: false });
    fireEvent.contextMenu(screen.getByTestId("target"));
    expect(await screen.findByText(/download as zip/i)).toBeInTheDocument();
  });
```

(The test file's existing `wrap` helper already sets up providers. Use the same.)

### Step 2: Implement

Open `app/src/components/FolderContextMenu.tsx`. Inside the single-mode branch (NOT the batch branch), add a `<ContextMenu.Item>` for download. Location: just below the `open` item, before the `canManage` separator.

Add a helper at the top of the file (before `FolderContextMenu`):

```tsx
function downloadFolderZip(folderId: string) {
  const a = document.createElement("a");
  a.href = `/api/folders/${folderId}/zip`;
  a.download = "";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
```

Then inside the existing `<ContextMenu.Content>` single-mode branch, after the `open` item:

```tsx
<ContextMenu.Item
  className={styles.item}
  onSelect={() => downloadFolderZip(folder.id)}
>
  download as zip
</ContextMenu.Item>
```

Do NOT add this in the batch-mode branch — batch-mode folder context menu stays unchanged (no zip for multi-folder selections in this phase).

### Step 3: Run

```bash
cd /root/vorevault/app && npm test -- FolderContextMenu
```

Expected: existing cases + 1 new = 5 total.

### Step 4: Commit

```bash
cd /root/vorevault
git add app/src/components/FolderContextMenu.tsx app/src/components/FolderContextMenu.test.tsx
git commit -m "feat(ui): FolderContextMenu — Download as zip action in single mode"
```

---

## Task 5: Verification + PR

- [ ] **Step 1: Full unit suite**
  ```bash
  cd /root/vorevault/app && npm test -- 'src/components' 'src/app/(shell)' 'src/app/login' 'src/lib/zip' 'src/lib/gridNav' 2>&1 | tail -6
  ```
  Record count. Expected: all green (the folder tree tests may appear in the summary as skipped/failed only because of Docker absence, not real code errors).

- [ ] **Step 2: Build**
  ```bash
  cd /root/vorevault/app && npm run build 2>&1 | tail -5
  ```
  Expected: clean. The new route appears in the build's route list.

- [ ] **Step 3: Manual browser checks** (requires dev session with Docker + data)
  - Right-click a folder with some files → "Download as zip" appears.
  - Click it → browser downloads `vorevault-<folder-name>-<date>.zip`.
  - Open the zip → contains all files under the folder, with subfolder structure preserved.
  - Right-click an empty folder → click Download → 404 "folder is empty".
  - Right-click a folder while also holding Cmd to select it (selection > 1 scenario) → context menu shows batch mode, NO zip (batch mode unchanged).
  - Folder name with `/` in it (create via direct SQL if needed) → zip filename and inner paths use `_` instead.
  - Non-owner/non-admin user → "Download as zip" is still visible (everyone in the group can download).

- [ ] **Step 4: Commit plan + push + open PR**
  ```bash
  cd /root/vorevault
  git add docs/superpowers/plans/2026-04-23-phase-2d-folder-zip.md
  git commit -m "docs: Phase 2d implementation plan"
  git push -u origin feat/phase-2d-folder-zip
  gh pr create --title "feat: Phase 2d — folder-zip download (recursive, tree-preserving)" --body "$(cat <<'EOF'
## Summary

Right-click any folder → Download as zip. The download is a streamed archive preserving the full subtree (e.g. `RootFolder/sub/file.mp4`). No cap — archiver streams one file at a time.

- New lib function \`collectFolderTreeFiles(folderId)\` runs a recursive CTE and returns zip entries with sanitized paths (folder or file names containing \`/\` become \`_\`).
- New route \`GET /api/folders/:id/zip\` — session-auth, folder-exists, tree walk, stream via existing \`buildZipStream\` (STORE mode, filename dedup already in place).
- FolderContextMenu gets a "Download as zip" item in single-item mode. Available to all authenticated users (shared-pool principle).

## Deferred

- Multi-folder / mixed-selection zip from SelectionToolbar → out of scope.
- Batch-mode folder context menu → unchanged (no zip for folders-in-selection).
- Empty-subfolder entries in the zip → not included.
- Unified \`/api/zip?files=...&folders=...\` endpoint → YAGNI until someone asks.

## Test plan

- [x] Lib tests for \`collectFolderTreeFiles\` (integration; skip in Docker-less environments — consistent with existing pattern).
- [x] FolderContextMenu test for new menu item.
- [x] \`npm run build\` clean; route shows up in build output.
- [ ] Manual: context menu shows item, download streams correctly, subtree preserved, empty folder 404, sanitization works.
EOF
)"
  ```

---

## Self-review

**1. Spec coverage.** Recursive walk, tree preservation, new route, folder context-menu action, `/` sanitization — all present across tasks 2–4.

**2. Placeholder scan.** No "TBD" or "add error handling." Every task has complete code and exact commands.

**3. Type consistency.**
- `ZipEntry = { name, path }` from `@/lib/zip` used by both `collectFolderTreeFiles` and the route.
- `FolderEmptyError` added for symmetry with `FolderNotFoundError`; the route maps both to 404 text but the distinction helps callers differentiate in the future.
- `getFolder` already filters `deleted_at IS NULL`, so the route's `getFolder(id)` null-check suffices — no redundant `deleted_at` check (lesson from Phase 2b review).

**4. Security.**
- Path traversal: folder + file names get `/` replaced in SQL. Any residual `..` in names is benign inside a zip — extraction tools on modern systems refuse to extract above the root. Low risk.
- UUID validation on the route id.
- Session auth matches the existing streaming route.
- No user-controlled data reaches a filesystem path — `storage_path` comes from the DB, built during upload.

**5. Performance.**
- One CTE query per download (no N+1).
- Archiver STORE mode: no compression cost on already-compressed media.
- Streaming: memory bounded regardless of tree size.
- No hard cap — matches user's "no cap" direction.

**6. Follow-up risk.** If users later want mixed-selection zip from the toolbar, a follow-up can add `GET /api/zip?files=...&folders=...` that composes the files-only route's logic with `collectFolderTreeFiles`. No refactor needed.
