# Home Feed (batch-aware) + Tagging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the home page's activity-feed semantics (loose files as individual tiles, folder uploads as one collapsed tile) and add a flat tag namespace with uploader-as-auto-tag + a tag filter on All Files.

**Architecture:** New `upload_batches` table records every folder-upload as a unit; `files`/`folders` gain nullable `upload_batch_id` columns. `listTopLevelItems` emits one folder tile per batch (+ a legacy fallback for pre-batch top-level folders) plus one file tile per loose file. Tags are a flat lowercase namespace (`tags` + `file_tags`); every file is auto-tagged with `#<normalized-username>` at upload time. The home page renders Recent strip + Folders grid + All Files paginated grid; a FilterBar above All Files filters by `?tag=<id>`.

**Tech Stack:** Postgres 16, Next.js 15 App Router, TypeScript strict, Zod for API validation, Vitest + testcontainers for DB integration, jsdom + `@testing-library/react` for components. All tests colocated.

**Spec:** `docs/superpowers/specs/2026-04-24-home-feed-and-tagging-design.md`.

**Supersedes:** `docs/superpowers/plans/2026-04-24-tags.md` (never implemented; uploader was a separate dropdown — now it's a tag).

---

## File Structure

**Schema:**
- Create: `db/init/07-upload-batches.sql`
- Create: `db/init/08-tags.sql`

**Server (lib):**
- Create: `app/src/lib/upload-batches.ts` — batch CRUD helpers.
- Create: `app/src/lib/upload-batches.integration.test.ts`
- Create: `app/src/lib/tags.ts` — `normalizeTagName`, `TagNameError`, DB helpers.
- Create: `app/src/lib/tags.test.ts` (pure helper tests).
- Create: `app/src/lib/tags.integration.test.ts`
- Create: `app/src/lib/username-to-tag.ts` — pure helper.
- Create: `app/src/lib/username-to-tag.test.ts`
- Modify: `app/src/lib/files.ts` — rewrite `listTopLevelItems` with `TopLevelOptions` + new branch-A (batches), branch-B (loose files), legacy-fallback.
- Create: `app/src/lib/files.topLevel.integration.test.ts`
- Modify: `app/src/lib/folder-tree-create.ts` — accept optional `batchId` and stamp new folders with it.

**Server (API):**
- Create: `app/src/app/api/upload-batches/route.ts` — `POST` creates a batch + top folder (+ subfolder tree), returns `{ batchId, topFolderId, folders }`.
- Create: `app/src/app/api/upload-batches/route.test.ts`
- Create: `app/src/app/api/tags/route.ts` — `GET`.
- Create: `app/src/app/api/files/[id]/tags/route.ts` — `POST` attach.
- Create: `app/src/app/api/files/[id]/tags/[tagId]/route.ts` — `DELETE` detach.
- Modify: `app/src/app/api/hooks/tus/route.ts` — read `upload_batch_id` from tus metadata; call auto-tag with uploader username after insert.

**Client:**
- Modify: `app/src/lib/uploadTree.ts` — call `/api/upload-batches` when `paths.length > 0`, pass `batchId` to tus metadata via a new `enqueue` signature.
- Modify: `app/src/components/UploadProgressProvider.tsx` (only if enqueue signature changes — check when editing).

**Components:**
- Create: `app/src/components/TagChip.tsx`, `TagChip.module.css`, `TagChip.test.tsx`
- Create: `app/src/components/FileTagsEditor.tsx`, `FileTagsEditor.module.css`, `FileTagsEditor.test.tsx`
- Create: `app/src/components/FilterBar.tsx`, `FilterBar.module.css`, `FilterBar.test.tsx`

**Pages:**
- Modify: `app/src/app/(shell)/page.tsx` — new shape (strip + folders + FilterBar + All Files), pass `tagId` through.
- Modify: `app/src/app/(shell)/f/[id]/page.tsx` — render `FileTagsEditor` under the title block.
- Modify: `app/src/app/(shell)/recent/page.tsx` — update to new options-object signature of `listTopLevelItems` (no UI change).

**Ops / migration:**
- Create: `app/scripts/backfill-batches-and-tags.ts`
- Create: `app/scripts/backfill-batches-and-tags.integration.test.ts`
- Modify: `VOREVAULT_MASTER_CONTEXT.md` — add runbook entry.

No file grows past ~400 lines.

---

## Deploy invariant

The new `listTopLevelItems` SQL includes a **legacy fallback** branch that emits a folder tile for any top-level folder without a batch. This keeps pre-migration behavior intact: user-home folders, manually-created folders, and legacy folder uploads all still show as folder tiles. Running the backfill script is recommended but **not required** for the new code to ship. Post-backfill, legacy folder-uploaded files collapse correctly.

---

### Task 1: Schema — `upload_batches` + alters

**Files:**
- Create: `db/init/07-upload-batches.sql`

**Constraints:** Column adds are idempotent (`ADD COLUMN IF NOT EXISTS`). FKs use `ON DELETE SET NULL` so trashing/purging a top folder doesn't cascade-delete the batch row. Indexes are partial (only non-null batch ids) to stay tiny.

- [ ] **Step 1: Write the migration**

```sql
-- db/init/07-upload-batches.sql
CREATE TABLE IF NOT EXISTS upload_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  top_folder_id   uuid REFERENCES folders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE files   ADD COLUMN IF NOT EXISTS upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS files_upload_batch_idx
  ON files   (upload_batch_id) WHERE upload_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS folders_upload_batch_idx
  ON folders (upload_batch_id) WHERE upload_batch_id IS NOT NULL;
```

- [ ] **Step 2: Run schema test to verify it loads cleanly**

Run: `cd app && npx vitest run tests/schema.test.ts`
Expected: PASS. `tests/schema.test.ts` runs every `db/init/*.sql` in alphabetical order during fixture setup; a syntax error would surface here first.

- [ ] **Step 3: Add a coverage-ish assertion to `tests/files-schema.test.ts`** so the new columns don't regress

Open `app/tests/files-schema.test.ts` and append:

```ts
it("files table has upload_batch_id column", async () => {
  const { rows } = await pg.pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'files' AND column_name = 'upload_batch_id'`,
  );
  expect(rows).toHaveLength(1);
});

it("folders table has upload_batch_id column", async () => {
  const { rows } = await pg.pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'folders' AND column_name = 'upload_batch_id'`,
  );
  expect(rows).toHaveLength(1);
});

it("upload_batches table exists with required columns", async () => {
  const { rows } = await pg.pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'upload_batches' ORDER BY ordinal_position`,
  );
  expect(rows.map(r => r.column_name)).toEqual(
    expect.arrayContaining(["id", "uploader_id", "top_folder_id", "created_at"]),
  );
});
```

- [ ] **Step 4: Run the schema tests**

Run: `cd app && npx vitest run tests/files-schema.test.ts tests/schema.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add db/init/07-upload-batches.sql app/tests/files-schema.test.ts
git commit -m "feat(db): upload_batches table + nullable batch_id on files/folders"
```

---

### Task 2: `upload-batches` DB helpers + integration tests

**Files:**
- Create: `app/src/lib/upload-batches.ts`
- Create: `app/src/lib/upload-batches.integration.test.ts`

**Constraints:** One module, one responsibility — batch CRUD. No folder-creation logic here (that stays in `folder-tree-create.ts`). Types exported for use by the API and tus hook.

- [ ] **Step 1: Write the failing integration test**

```ts
// app/src/lib/upload-batches.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import {
  createUploadBatch,
  setBatchTopFolder,
  getUploadBatch,
} from "./upload-batches";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("./db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  const u = await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-batch','batchuser') RETURNING id`,
  );
  userId = u.rows[0].id;
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("upload-batches helpers", () => {
  it("creates a batch with null top_folder_id", async () => {
    const batch = await createUploadBatch(userId);
    expect(batch.id).toBeDefined();
    expect(batch.top_folder_id).toBeNull();
    expect(batch.uploader_id).toBe(userId);
  });

  it("sets top_folder_id after folder is created", async () => {
    const batch = await createUploadBatch(userId);
    const f = await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Valheim', NULL, $1) RETURNING id`,
      [userId],
    );
    await setBatchTopFolder(batch.id, f.rows[0].id);
    const reread = await getUploadBatch(batch.id);
    expect(reread?.top_folder_id).toBe(f.rows[0].id);
  });

  it("getUploadBatch returns null for unknown id", async () => {
    const reread = await getUploadBatch("00000000-0000-0000-0000-000000000000");
    expect(reread).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/lib/upload-batches.integration.test.ts`
Expected: FAIL with "Cannot find module" or "export not found".

- [ ] **Step 3: Implement the helpers**

```ts
// app/src/lib/upload-batches.ts
import { pool } from "@/lib/db";

export type UploadBatchRow = {
  id: string;
  uploader_id: string;
  top_folder_id: string | null;
  created_at: Date;
};

export async function createUploadBatch(uploaderId: string): Promise<UploadBatchRow> {
  const { rows } = await pool.query<UploadBatchRow>(
    `INSERT INTO upload_batches (uploader_id) VALUES ($1)
     RETURNING id, uploader_id, top_folder_id, created_at`,
    [uploaderId],
  );
  return rows[0];
}

export async function setBatchTopFolder(batchId: string, folderId: string): Promise<void> {
  await pool.query(
    `UPDATE upload_batches SET top_folder_id = $1 WHERE id = $2`,
    [folderId, batchId],
  );
}

export async function getUploadBatch(batchId: string): Promise<UploadBatchRow | null> {
  const { rows } = await pool.query<UploadBatchRow>(
    `SELECT id, uploader_id, top_folder_id, created_at FROM upload_batches WHERE id = $1`,
    [batchId],
  );
  return rows[0] ?? null;
}

export async function stampFoldersWithBatch(
  batchId: string,
  folderIds: string[],
): Promise<void> {
  if (folderIds.length === 0) return;
  await pool.query(
    `UPDATE folders SET upload_batch_id = $1 WHERE id = ANY($2::uuid[]) AND upload_batch_id IS NULL`,
    [batchId, folderIds],
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/lib/upload-batches.integration.test.ts`
Expected: PASS (3 green).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/upload-batches.ts app/src/lib/upload-batches.integration.test.ts
git commit -m "feat(upload-batches): DB helpers (create, setTopFolder, get, stampFolders)"
```

---

### Task 3: API route + client wiring for batch creation

**Files:**
- Create: `app/src/app/api/upload-batches/route.ts`
- Create: `app/src/app/api/upload-batches/route.test.ts`
- Modify: `app/src/lib/folder-tree-create.ts` — accept optional `batchId` and stamp folders.
- Modify: `app/src/lib/uploadTree.ts` — create batch first, pass `batchId` to tus metadata.
- Modify: `app/src/app/api/folders/tree/route.ts` — accept optional `batch_id` in body, pass through.
- Modify: `app/src/app/api/hooks/tus/route.ts` — read `upload_batch_id` from tus metadata, pass to `insertFile`.
- Modify: `app/src/lib/files.ts` — `insertFile` accepts `uploadBatchId` arg.

**Constraints:** The endpoint's only job is to create a batch. Folder-tree creation stays with the existing `POST /api/folders/tree`, which is extended to accept a batch_id so folders get stamped during creation. Two-call flow keeps each endpoint single-purpose.

- [ ] **Step 1: Write failing route test for `POST /api/upload-batches`**

```ts
// app/src/app/api/upload-batches/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/upload-batches", () => ({
  createUploadBatch: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { createUploadBatch } from "@/lib/upload-batches";

describe("POST /api/upload-batches", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(createUploadBatch).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request("http://test", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("creates a batch and returns batchId", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", username: "alice", is_admin: false } as never);
    vi.mocked(createUploadBatch).mockResolvedValue({
      id: "b1", uploader_id: "u1", top_folder_id: null, created_at: new Date(),
    });
    const res = await POST(new Request("http://test", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batchId).toBe("b1");
    expect(createUploadBatch).toHaveBeenCalledWith("u1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npx vitest run src/app/api/upload-batches/route.test.ts`
Expected: FAIL (route doesn't exist).

- [ ] **Step 3: Implement the route**

```ts
// app/src/app/api/upload-batches/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createUploadBatch } from "@/lib/upload-batches";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const batch = await createUploadBatch(user.id);
  return NextResponse.json({ batchId: batch.id });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npx vitest run src/app/api/upload-batches/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `folder-tree-create.ts` to accept `batchId`**

Change the signature and implementation:

```ts
// app/src/lib/folder-tree-create.ts  (inside CreateFolderTreeArgs + createFolderTree)
export type CreateFolderTreeArgs = {
  parentId: string | null;
  paths: string[];
  actorId: string;
  batchId?: string | null;   // new
};

// inside createFolderTree, when inserting a new folder row:
const { rows } = await client.query<{ id: string }>(
  `INSERT INTO folders (name, parent_id, created_by, upload_batch_id)
   VALUES ($1, $2, $3, $4) RETURNING id`,
  [name, parentId, args.actorId, args.batchId ?? null],
);
```

(The existing-folder "continue" path stays unchanged — we don't re-stamp existing folders.)

- [ ] **Step 6: Extend `POST /api/folders/tree` body to accept `batch_id`**

```ts
// app/src/app/api/folders/tree/route.ts — update PostBody
const PostBody = z.object({
  parent_id: z.string().uuid().nullable(),
  paths: z.array(z.string().min(1).max(512)).min(1).max(5000),
  batch_id: z.string().uuid().optional(),
});

// and pass through to createFolderTree:
const folders = await createFolderTree({
  parentId: parsed.data.parent_id,
  paths,
  actorId: user.id,
  batchId: parsed.data.batch_id ?? null,
});

// After createFolderTree, if a batchId + top folder exist, set top_folder_id:
if (parsed.data.batch_id) {
  // "top folder" = the folder mapped from the shortest path (no slashes)
  const topPath = paths.find(p => !p.includes("/"));
  if (topPath && folders[topPath]) {
    await setBatchTopFolder(parsed.data.batch_id, folders[topPath]);
  }
}
```

Import `setBatchTopFolder` from `@/lib/upload-batches`.

- [ ] **Step 7: Thread `batchId` through `uploadTree.ts`**

```ts
// app/src/lib/uploadTree.ts
export type UploadEnqueue = (file: File, folderId: string | null, batchId: string | null) => void;

export async function uploadItemsWithTree(opts: UploadTreeOptions): Promise<void> {
  // … (existing path collection)

  let batchId: string | null = null;
  if (paths.length > 0) {
    // folder upload → create a batch
    try {
      const batchRes = await fetch("/api/upload-batches", { method: "POST" });
      if (batchRes.ok) {
        const { batchId: bid } = await batchRes.json() as { batchId?: string };
        batchId = bid ?? null;
      }
    } catch { /* non-fatal; proceed without batch */ }
  }

  // existing folder-tree call, now with batch_id:
  if (paths.length > 0) {
    const res = await fetch("/api/folders/tree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parent_id: destFolderId, paths, batch_id: batchId }),
    });
    // … (existing error handling + map)
  }

  for (let i = 0; i < items.length; i++) {
    const dir = relDirs[i];
    const target = dir ? (map[dir] ?? destFolderId) : destFolderId;
    enqueue(items[i].file, target, batchId);
  }
}
```

- [ ] **Step 8: Update `UploadProgressProvider` to accept and forward the `batchId` in tus metadata**

Open `app/src/components/UploadProgressProvider.tsx`. Find the `enqueue` implementation and tus upload creation. Extend the signature and append batch_id to tus metadata:

```ts
// where tus.Upload is constructed:
const metadata: Record<string, string> = {
  filename: file.name,
  filetype: file.type,
};
if (folderId) metadata.folderId = folderId;
if (batchId)  metadata.upload_batch_id = batchId;

const upload = new tus.Upload(file, {
  endpoint: TUS_ENDPOINT,
  metadata,
  // …
});
```

(If the existing provider already uses an enqueue signature that takes a single options object, adjust accordingly. The goal: `upload_batch_id` reaches tus metadata.)

- [ ] **Step 9: Update tus hook to read `upload_batch_id` from metadata**

```ts
// app/src/app/api/hooks/tus/route.ts — inside postFinish, near where folderId is read:
const rawBatchId = body.Event.Upload.MetaData?.upload_batch_id;
let uploadBatchId: string | null = null;
if (typeof rawBatchId === "string" && uuidRegex.test(rawBatchId)) {
  uploadBatchId = rawBatchId;
}

// pass to insertFile:
const inserted = await insertFile({
  // … existing fields,
  uploadBatchId,
});
```

- [ ] **Step 10: Extend `insertFile` in `app/src/lib/files.ts`**

```ts
export type InsertFileArgs = {
  // … existing fields
  uploadBatchId?: string | null;
};

export async function insertFile(args: InsertFileArgs): Promise<FileRow> {
  const { rows } = await pool.query<FileRow>(
    `INSERT INTO files
       (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path,
        thumbnail_path, duration_sec, width, height, upload_batch_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      args.uploaderId, args.folderId ?? null, args.originalName, args.mimeType, args.sizeBytes,
      args.storagePath, args.thumbnailPath ?? null, args.durationSec ?? null,
      args.width ?? null, args.height ?? null, args.uploadBatchId ?? null,
    ],
  );
  return rows[0];
}
```

Also add `upload_batch_id: string | null` to the `FileRow` type.

- [ ] **Step 11: Run the full API + route suite**

Run: `cd app && npx vitest run src/app/api/upload-batches src/app/api/folders/tree src/app/api/hooks/tus src/lib/files.ts`
Expected: PASS. If there are existing route tests that broke because of the new parameter, update them to pass `upload_batch_id: null`.

- [ ] **Step 12: Commit**

```bash
git add app/src/app/api/upload-batches app/src/app/api/folders/tree/route.ts \
        app/src/app/api/hooks/tus/route.ts \
        app/src/lib/folder-tree-create.ts app/src/lib/uploadTree.ts \
        app/src/lib/files.ts app/src/components/UploadProgressProvider.tsx
git commit -m "feat(upload): batch creation + stamp folders/files with upload_batch_id"
```

---

### Task 4: Rewrite `listTopLevelItems` (batch-aware)

**Files:**
- Modify: `app/src/lib/files.ts` — `TopLevelOptions`, rewritten `listTopLevelItems`, updated `listRecentTopLevelItems`.
- Create: `app/src/lib/files.topLevel.integration.test.ts`
- Modify: `app/src/app/(shell)/page.tsx`, `app/src/app/(shell)/recent/page.tsx` — use options-object signature.

**Constraints:**
- Branch A: folder tiles from `upload_batches` (batch's top folder, `created_at` = batch time).
- Branch A-legacy: folder tiles for top-level folders that have NO `upload_batch_id` (pre-migration, user home folders, manual folders). Uses `folder.created_at`.
- Branch B: file tiles for files where `upload_batch_id IS NULL`.
- When `tagId` is set: branches A + A-legacy are dropped entirely; branch B filters by tag.
- Each file row in branch B carries a `tags: string[]` (names) via lateral `array_agg` for rendering on tiles (not used in v1 but cheap to include for forward-compat — remove if concerned about perf).

- [ ] **Step 1: Write failing integration tests**

```ts
// app/src/lib/files.topLevel.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import { listTopLevelItems } from "./files";

let fx: PgFixture;
let userId: string;
let batchId: string;
let topFolderId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("./db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });

  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-top','alice') RETURNING id`,
  )).rows[0].id;

  // 1) Legacy top-level folder (no batch) with one file inside
  const legacy = await fx.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by)
     VALUES ('LegacyFolder', NULL, $1) RETURNING id`, [userId],
  );
  await fx.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, 'inner.mp4', 'video/mp4', 1, '/x')`,
    [userId, legacy.rows[0].id],
  );

  // 2) Folder-upload batch: Valheim/ with 3 inner files
  batchId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO upload_batches (uploader_id) VALUES ($1) RETURNING id`, [userId],
  )).rows[0].id;
  topFolderId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO folders (name, parent_id, created_by, upload_batch_id)
     VALUES ('Valheim', NULL, $1, $2) RETURNING id`, [userId, batchId],
  )).rows[0].id;
  await fx.pool.query(
    `UPDATE upload_batches SET top_folder_id = $1 WHERE id = $2`, [topFolderId, batchId],
  );
  for (let i = 0; i < 3; i++) {
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, upload_batch_id)
       VALUES ($1, $2, $3, 'video/mp4', 1, '/x', $4)`,
      [userId, topFolderId, `clip-${i}.mp4`, batchId],
    );
  }

  // 3) Loose file dropped into legacy folder individually (no batch)
  await fx.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, 'solo.mp4', 'video/mp4', 1, '/x')`,
    [userId, legacy.rows[0].id],
  );

  // 4) Loose file at root (folder_id NULL, no batch)
  await fx.pool.query(
    `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, NULL, 'rooted.mp4', 'video/mp4', 1, '/x')`,
    [userId],
  );
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("listTopLevelItems (batch-aware)", () => {
  it("emits exactly one folder tile per upload batch", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const valheim = page.items.filter((i) => i.kind === "folder" && i.name === "Valheim");
    expect(valheim).toHaveLength(1);
  });

  it("emits one folder tile per legacy top-level folder", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const legacy = page.items.filter((i) => i.kind === "folder" && i.name === "LegacyFolder");
    expect(legacy).toHaveLength(1);
  });

  it("does NOT emit file tiles for files inside a folder-upload batch", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const clips = page.items.filter((i) => i.kind === "file" && i.original_name.startsWith("clip-"));
    expect(clips).toHaveLength(0);
  });

  it("emits file tiles for loose files (root AND dropped into existing folders)", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const names = page.items
      .filter((i) => i.kind === "file")
      .map((i) => (i as { original_name: string }).original_name);
    expect(names).toEqual(expect.arrayContaining(["solo.mp4", "rooted.mp4", "inner.mp4"]));
  });

  it("orders items by created_at DESC across branches", async () => {
    const page = await listTopLevelItems(1, 50, {});
    const times = page.items.map((i) => new Date(i.created_at).getTime());
    for (let i = 1; i < times.length; i++) expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
  });

  it("total count matches items across branches", async () => {
    const page = await listTopLevelItems(1, 50, {});
    expect(page.total).toBe(page.items.length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd app && npx vitest run src/lib/files.topLevel.integration.test.ts`
Expected: FAIL (signature mismatch or missing legacy branch).

- [ ] **Step 3: Rewrite `listTopLevelItems` + `listRecentTopLevelItems`**

Replace the existing `listTopLevelItems` (lines 341-413) and `listRecentTopLevelItems` (lines 449-452) in `app/src/lib/files.ts`:

```ts
export type TopLevelOptions = {
  extraOffset?: number;
  tagId?: string;
};

export async function listTopLevelItems(
  page: number,
  limit: number,
  opts: TopLevelOptions = {},
): Promise<TopLevelPage> {
  const extraOffset = opts.extraOffset ?? 0;
  const tagId = opts.tagId;
  const offset = (page - 1) * limit + extraOffset;

  const hasTagFilter = !!tagId;
  const params: unknown[] = [];
  const tagParamIdx = (() => {
    if (!hasTagFilter) return null;
    params.push(tagId);
    return params.length;
  })();

  // Branch A (batch) — one row per batch with a live top folder.
  // Dropped entirely when tagId is set (folders aren't tagged).
  const branchBatch = `
    SELECT
      'folder'::text AS kind,
      f.id::text AS id,
      f.name AS name,
      NULL::text AS original_name,
      NULL::text AS mime_type,
      NULL::text AS thumbnail_path,
      NULL::text AS uploader_name,
      f.created_by::text AS created_by,
      b.created_at AS created_at,
      (SELECT count(*)::int FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL) AS direct_file_count,
      (SELECT count(*)::int FROM folders s WHERE s.parent_id = f.id AND s.deleted_at IS NULL) AS direct_subfolder_count,
      NULL::bigint AS size_bytes,
      NULL::text AS storage_path,
      NULL::text AS transcode_status,
      NULL::text AS transcoded_path,
      NULL::int AS duration_sec,
      NULL::int AS width,
      NULL::int AS height,
      '{}'::text[] AS tags
    FROM upload_batches b
    JOIN folders f ON f.id = b.top_folder_id
    WHERE f.deleted_at IS NULL
  `;

  // Branch A-legacy — top-level folders without a batch (pre-migration,
  // user home folders, manual folders). Uses folder.created_at.
  const branchLegacyFolder = `
    SELECT
      'folder'::text, f.id::text, f.name,
      NULL::text, NULL::text, NULL::text, NULL::text,
      f.created_by::text, f.created_at,
      (SELECT count(*)::int FROM files x WHERE x.folder_id = f.id AND x.deleted_at IS NULL),
      (SELECT count(*)::int FROM folders s WHERE s.parent_id = f.id AND s.deleted_at IS NULL),
      NULL::bigint, NULL::text, NULL::text, NULL::text,
      NULL::int, NULL::int, NULL::int,
      '{}'::text[]
    FROM folders f
    WHERE f.parent_id IS NULL
      AND f.deleted_at IS NULL
      AND f.upload_batch_id IS NULL
  `;

  // Branch B — loose files (not part of a folder upload).
  const branchFile = `
    SELECT
      'file'::text, ff.id::text, NULL::text,
      ff.original_name, ff.mime_type, ff.thumbnail_path,
      u.username, ff.uploader_id::text, ff.created_at,
      NULL::int, NULL::int,
      ff.size_bytes, ff.storage_path, ff.transcode_status, ff.transcoded_path,
      ff.duration_sec, ff.width, ff.height,
      COALESCE(
        (SELECT array_agg(t.name ORDER BY t.name)
           FROM file_tags ft JOIN tags t ON t.id = ft.tag_id
          WHERE ft.file_id = ff.id),
        '{}'::text[]
      ) AS tags
    FROM files ff
    JOIN users u ON u.id = ff.uploader_id
    WHERE ff.deleted_at IS NULL
      AND ff.upload_batch_id IS NULL
      ${hasTagFilter
        ? `AND EXISTS (SELECT 1 FROM file_tags ft2 WHERE ft2.file_id = ff.id AND ft2.tag_id = $${tagParamIdx})`
        : ""}
  `;

  const unionSql = hasTagFilter
    ? branchFile
    : `${branchBatch} UNION ALL ${branchLegacyFolder} UNION ALL ${branchFile}`;

  params.push(limit, offset);
  const dataSql = `
    SELECT * FROM (${unionSql}) t
    ORDER BY created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  // Count SQL mirrors the same filters.
  const countParams: unknown[] = [];
  if (hasTagFilter) countParams.push(tagId);
  const countSql = hasTagFilter
    ? `SELECT (SELECT count(*)::int FROM files ff
                WHERE ff.deleted_at IS NULL
                  AND ff.upload_batch_id IS NULL
                  AND EXISTS (SELECT 1 FROM file_tags ft WHERE ft.file_id = ff.id AND ft.tag_id = $1)
              ) AS total`
    : `SELECT
         (SELECT count(*)::int FROM upload_batches b
            JOIN folders f ON f.id = b.top_folder_id
            WHERE f.deleted_at IS NULL)
         + (SELECT count(*)::int FROM folders
              WHERE parent_id IS NULL AND deleted_at IS NULL AND upload_batch_id IS NULL)
         + (SELECT count(*)::int FROM files
              WHERE deleted_at IS NULL AND upload_batch_id IS NULL)
         AS total`;

  const [dataRes, countRes] = await Promise.all([
    pool.query(dataSql, params),
    pool.query<{ total: number }>(countSql, countParams),
  ]);

  return {
    items: dataRes.rows.map(mapTopLevelRow),
    total: Math.max(0, countRes.rows[0].total - extraOffset),
    page,
    limit,
  };
}

export async function listRecentTopLevelItems(limit: number): Promise<TopLevelItem[]> {
  const page = await listTopLevelItems(1, limit, {});
  return page.items;
}
```

Also update `mapTopLevelRow`: add `tags: (r.tags as string[]) ?? []` to the file branch return (extend `TopLevelFileItem` type with `tags: string[]`).

Update `TopLevelFileItem` in the type definitions:

```ts
export type TopLevelFileItem = FileWithUploader & { kind: "file"; tags: string[] };
```

- [ ] **Step 4: Update callers to options-object signature**

Open `app/src/app/(shell)/page.tsx`:

```ts
// Change:
listTopLevelItems(page, limit, RECENT_STRIP_COUNT)
// To:
listTopLevelItems(page, limit, { extraOffset: RECENT_STRIP_COUNT })
```

Same change in `app/src/app/(shell)/recent/page.tsx`.

Also check `app/src/app/(shell)/starred/page.tsx` and other call sites — grep first:

```bash
grep -rn "listTopLevelItems\b" app/src
```

Fix any other callers.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npx vitest run src/lib/files.topLevel.integration.test.ts`
Expected: PASS (6 green).

- [ ] **Step 6: Run the full test suite + build to catch type regressions**

Run: `cd app && npm test -- --run && npm run build`
Expected: PASS (pre-existing testcontainer / ffprobe-related skips are acceptable). If a component test fails due to `TopLevelFileItem` now requiring `tags`, update fixtures to include `tags: []`.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/files.ts app/src/lib/files.topLevel.integration.test.ts \
        app/src/app/\(shell\)/page.tsx app/src/app/\(shell\)/recent/page.tsx
git commit -m "feat(files): batch-aware listTopLevelItems with legacy fallback + tagId filter"
```

---

### Task 5: Tags schema + `normalizeTagName`

**Files:**
- Create: `db/init/08-tags.sql`
- Create: `app/src/lib/tags.ts` (pure helper portion)
- Create: `app/src/lib/tags.test.ts`

**Constraints:** DB CHECK enforces the regex; JS helper matches exactly. Throwing `TagNameError` (not returning null) lets API layer map to 400.

- [ ] **Step 1: Write the migration**

```sql
-- db/init/08-tags.sql
CREATE TABLE IF NOT EXISTS tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE
             CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_tags (
  file_id    uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (file_id, tag_id)
);

CREATE INDEX IF NOT EXISTS file_tags_tag_id_idx  ON file_tags (tag_id);
CREATE INDEX IF NOT EXISTS file_tags_file_id_idx ON file_tags (file_id);
```

- [ ] **Step 2: Write failing unit tests for `normalizeTagName`**

```ts
// app/src/lib/tags.test.ts
import { describe, it, expect } from "vitest";
import { normalizeTagName, TagNameError } from "./tags";

describe("normalizeTagName", () => {
  it("lowercases and trims", () => {
    expect(normalizeTagName("  Valheim  ")).toBe("valheim");
  });
  it("accepts alphanumeric + hyphen", () => {
    expect(normalizeTagName("side-quest")).toBe("side-quest");
    expect(normalizeTagName("2024-clips")).toBe("2024-clips");
  });
  it("rejects empty", () => {
    expect(() => normalizeTagName("  ")).toThrow(TagNameError);
  });
  it("rejects leading hyphen", () => {
    expect(() => normalizeTagName("-game")).toThrow(TagNameError);
  });
  it("rejects spaces + punctuation", () => {
    expect(() => normalizeTagName("hello world")).toThrow(TagNameError);
    expect(() => normalizeTagName("game!")).toThrow(TagNameError);
  });
  it("rejects over 32 chars", () => {
    expect(() => normalizeTagName("a".repeat(33))).toThrow(TagNameError);
  });
  it("accepts 32 chars exactly", () => {
    const max = "a".repeat(32);
    expect(normalizeTagName(max)).toBe(max);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd app && npx vitest run src/lib/tags.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `normalizeTagName`**

```ts
// app/src/lib/tags.ts
export class TagNameError extends Error {
  constructor(message: string) { super(message); this.name = "TagNameError"; }
}

const TAG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function normalizeTagName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (!lower) throw new TagNameError("tag name is empty");
  if (lower.length > 32) throw new TagNameError("tag name is longer than 32 chars");
  if (!TAG_RE.test(lower)) {
    throw new TagNameError(
      "tag names must be lowercase letters, digits, or hyphens, and can't start with a hyphen",
    );
  }
  return lower;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd app && npx vitest run src/lib/tags.test.ts tests/schema.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add db/init/08-tags.sql app/src/lib/tags.ts app/src/lib/tags.test.ts
git commit -m "feat(tags): tags + file_tags tables; normalizeTagName pure helper"
```

---

### Task 6: Tags DB helpers + integration tests + API routes

**Files:**
- Modify: `app/src/lib/tags.ts` — append DB helpers.
- Create: `app/src/lib/tags.integration.test.ts`
- Create: `app/src/app/api/tags/route.ts`
- Create: `app/src/app/api/files/[id]/tags/route.ts`
- Create: `app/src/app/api/files/[id]/tags/[tagId]/route.ts`

**Constraints:**
- `attachTagToFile(fileId, rawName, actorUserId)` upserts tag by name, inserts `file_tags` with `ON CONFLICT DO NOTHING`, returns the tag row.
- `detachTagFromFileById(fileId, tagId)` removes the link but keeps the tag row.
- `listTagsForFile(fileId)` returns name-sorted tags.
- `listAllTagsWithCounts()` returns all tags with `file_count` joining only live files.
- API auth: reuse `getCurrentUser`. Anyone in group can attach/detach. 404 if file missing or soft-deleted; 400 on `TagNameError` with `{ error, reason }`.

- [ ] **Step 1: Write failing integration test**

```ts
// app/src/lib/tags.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../../tests/pg";
import {
  attachTagToFile, detachTagFromFileById,
  listTagsForFile, listAllTagsWithCounts,
} from "./tags";

let fx: PgFixture;
let userId: string;
let fileId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("./db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-tag','tagger') RETURNING id`,
  )).rows[0].id;
  fileId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO files (uploader_id, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, 'clip.mp4', 'video/mp4', 1, '/x') RETURNING id`, [userId],
  )).rows[0].id;
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("tags DB helpers", () => {
  it("attach creates tag on first use and is idempotent", async () => {
    const t1 = await attachTagToFile(fileId, "Valheim", userId);
    expect(t1.name).toBe("valheim");
    const t2 = await attachTagToFile(fileId, "valheim", userId);
    expect(t2.id).toBe(t1.id);
    const list = await listTagsForFile(fileId);
    expect(list.map((t) => t.name)).toEqual(["valheim"]);
  });
  it("detachById removes the link, keeps the tag row", async () => {
    const mc = await attachTagToFile(fileId, "minecraft", userId);
    await detachTagFromFileById(fileId, mc.id);
    const list = await listTagsForFile(fileId);
    expect(list.map((t) => t.name)).toEqual(["valheim"]);
    const all = await listAllTagsWithCounts();
    expect(all.find((t) => t.name === "minecraft")?.file_count).toBe(0);
  });
  it("listAllTagsWithCounts sorted by name with counts", async () => {
    const all = await listAllTagsWithCounts();
    const names = all.map((t) => t.name);
    expect(names).toEqual([...names].sort());
    expect(all.find((t) => t.name === "valheim")?.file_count).toBe(1);
  });
  it("attach rejects invalid tag names", async () => {
    await expect(attachTagToFile(fileId, "Hello World!", userId)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd app && npx vitest run src/lib/tags.integration.test.ts`
Expected: FAIL (helpers not exported).

- [ ] **Step 3: Append DB helpers to `app/src/lib/tags.ts`**

```ts
// (keep the pure helper + TagNameError already defined)
import { pool } from "@/lib/db";

export type Tag = { id: string; name: string; created_at: Date };
export type TagWithCount = Tag & { file_count: number };

export async function attachTagToFile(
  fileId: string,
  rawName: string,
  actorUserId: string,
): Promise<Tag> {
  const name = normalizeTagName(rawName);
  const up = await pool.query<Tag>(
    `INSERT INTO tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, created_at`,
    [name],
  );
  const tag = up.rows[0];
  await pool.query(
    `INSERT INTO file_tags (file_id, tag_id, created_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [fileId, tag.id, actorUserId],
  );
  return tag;
}

export async function detachTagFromFileById(fileId: string, tagId: string): Promise<void> {
  await pool.query(
    `DELETE FROM file_tags WHERE file_id = $1 AND tag_id = $2`,
    [fileId, tagId],
  );
}

export async function listTagsForFile(fileId: string): Promise<Tag[]> {
  const { rows } = await pool.query<Tag>(
    `SELECT t.id, t.name, t.created_at
       FROM tags t JOIN file_tags ft ON ft.tag_id = t.id
      WHERE ft.file_id = $1
      ORDER BY t.name ASC`,
    [fileId],
  );
  return rows;
}

export async function listAllTagsWithCounts(): Promise<TagWithCount[]> {
  const { rows } = await pool.query<TagWithCount>(
    `SELECT t.id, t.name, t.created_at,
            COALESCE(
              (SELECT count(*)::int FROM file_tags ft
                 JOIN files f ON f.id = ft.file_id
                WHERE ft.tag_id = t.id AND f.deleted_at IS NULL),
              0
            ) AS file_count
       FROM tags t
       ORDER BY t.name ASC`,
  );
  return rows;
}
```

- [ ] **Step 4: Run integration test**

Run: `cd app && npx vitest run src/lib/tags.integration.test.ts`
Expected: PASS (4 green).

- [ ] **Step 5: Write + implement `GET /api/tags`**

```ts
// app/src/app/api/tags/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAllTagsWithCounts } from "@/lib/tags";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const tags = await listAllTagsWithCounts();
  return NextResponse.json({ tags });
}
```

- [ ] **Step 6: Write + implement `POST /api/files/:id/tags`**

```ts
// app/src/app/api/files/[id]/tags/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { attachTagToFile, TagNameError } from "@/lib/tags";

const BodySchema = z.object({ name: z.string().min(1).max(64) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await params;
  const file = await getFileWithUploader(id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  try {
    const tag = await attachTagToFile(id, body.name, user.id);
    return NextResponse.json({ tag });
  } catch (err) {
    if (err instanceof TagNameError) {
      return NextResponse.json({ error: "invalid tag name", reason: err.message }, { status: 400 });
    }
    throw err;
  }
}
```

- [ ] **Step 7: Write + implement `DELETE /api/files/:id/tags/:tagId`**

```ts
// app/src/app/api/files/[id]/tags/[tagId]/route.ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getFileWithUploader } from "@/lib/files";
import { detachTagFromFileById } from "@/lib/tags";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id, tagId } = await params;
  const file = await getFileWithUploader(id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  await detachTagFromFileById(id, tagId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Smoke-test routes manually**

Run: `cd app && npm run build && npm run dev`. In another terminal:

```bash
curl -b "vv_session=<token>" http://localhost:3000/api/tags
curl -b "..." -X POST -H 'content-type: application/json' \
     -d '{"name":"valheim"}' http://localhost:3000/api/files/<file-id>/tags
```

Expected: `200` with the new tag row; a bad name returns `400` with `{ error, reason }`.

- [ ] **Step 9: Commit**

```bash
git add app/src/lib/tags.ts app/src/lib/tags.integration.test.ts \
        app/src/app/api/tags app/src/app/api/files/\[id\]/tags
git commit -m "feat(tags): DB helpers + API routes (list, attach, detach)"
```

---

### Task 7: `usernameToTag` + auto-tag on upload finalize

**Files:**
- Create: `app/src/lib/username-to-tag.ts`
- Create: `app/src/lib/username-to-tag.test.ts`
- Modify: `app/src/app/api/hooks/tus/route.ts` — call `attachTagToFile(fileId, usernameToTag(owner.username), owner.id)` after `insertFile`.

**Constraints:** Auto-tagging must be non-fatal — if it throws, log and continue (upload succeeds). If `usernameToTag` returns `null` (username scrubs to empty), skip.

- [ ] **Step 1: Write failing unit tests**

```ts
// app/src/lib/username-to-tag.test.ts
import { describe, it, expect } from "vitest";
import { usernameToTag } from "./username-to-tag";

describe("usernameToTag", () => {
  it("passes through plain lowercase", () => {
    expect(usernameToTag("alex")).toBe("alex");
  });
  it("lowercases uppercase", () => {
    expect(usernameToTag("Alex")).toBe("alex");
  });
  it("replaces . and _ with -", () => {
    expect(usernameToTag("ryan.vander_17")).toBe("ryan-vander-17");
  });
  it("collapses runs of dashes", () => {
    expect(usernameToTag("hello___world")).toBe("hello-world");
  });
  it("trims leading and trailing dashes", () => {
    expect(usernameToTag("_alex_")).toBe("alex");
    expect(usernameToTag("---alex---")).toBe("alex");
  });
  it("caps at 32 chars", () => {
    const name = "a".repeat(40);
    expect(usernameToTag(name)).toBe("a".repeat(32));
  });
  it("returns null when result is empty", () => {
    expect(usernameToTag("___")).toBeNull();
    expect(usernameToTag("")).toBeNull();
    expect(usernameToTag("!@#")).toBeNull();
  });
  it("never starts with a hyphen after cap", () => {
    // Edge: 32 chars of dashes + 'a' → capped at 32 dashes → trimmed → empty → null
    expect(usernameToTag("-".repeat(40) + "a")).toBe("a");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd app && npx vitest run src/lib/username-to-tag.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `usernameToTag`**

```ts
// app/src/lib/username-to-tag.ts
export function usernameToTag(raw: string): string | null {
  const scrubbed = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!scrubbed) return null;
  const capped = scrubbed.slice(0, 32).replace(/^-+|-+$/g, "");
  return capped || null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd app && npx vitest run src/lib/username-to-tag.test.ts`
Expected: PASS (8 green).

- [ ] **Step 5: Wire auto-tag into tus hook**

Open `app/src/app/api/hooks/tus/route.ts`. Locate where `insertFile` + `finalizeUploadSession` are called (near end of `postFinish`). Add auto-tag step:

```ts
// imports
import { attachTagToFile } from "@/lib/tags";
import { usernameToTag } from "@/lib/username-to-tag";

// after:
//   const inserted = await insertFile({ … });
//   await finalizeUploadSession(tusId, inserted.id);

const owner = await getUserById(session.user_id);   // reuse existing helper if already fetched above
if (owner) {
  const tagName = usernameToTag(owner.username);
  if (tagName) {
    try {
      await attachTagToFile(inserted.id, tagName, owner.id);
    } catch (err) {
      console.error(`auto-tag failed for ${inserted.id} (${tagName}):`, err);
    }
  }
}
```

(If `owner` is already fetched earlier in the handler for the home-folder fallback, reuse that variable instead of re-fetching.)

- [ ] **Step 6: Add an integration test for auto-tag in the tus hook**

Open `app/src/app/api/hooks/tus/route.test.ts`. If it's a pure unit test using mocks, extend the post-finish success case with:

```ts
// in the existing success-finalize test, add an assertion:
expect(attachTagToFile).toHaveBeenCalledWith(
  expect.any(String),          // file id
  expect.stringMatching(/^[a-z0-9][a-z0-9-]{0,31}$/),
  expect.any(String),          // user id
);
```

If the existing tests don't mock `attachTagToFile`, add the mock + import.

- [ ] **Step 7: Run the hook + tag tests**

Run: `cd app && npx vitest run src/app/api/hooks/tus src/lib/tags src/lib/username-to-tag`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/username-to-tag.ts app/src/lib/username-to-tag.test.ts \
        app/src/app/api/hooks/tus/route.ts app/src/app/api/hooks/tus/route.test.ts
git commit -m "feat(tags): auto-tag uploads with normalized uploader username"
```

---

### Task 8: `TagChip` + `FileTagsEditor` + render on file-detail page

**Files:**
- Create: `app/src/components/TagChip.tsx`, `TagChip.module.css`, `TagChip.test.tsx`
- Create: `app/src/components/FileTagsEditor.tsx`, `FileTagsEditor.module.css`, `FileTagsEditor.test.tsx`
- Modify: `app/src/app/(shell)/f/[id]/page.tsx`

**Constraints:**
- `TagChip` uses `--vv-*` tokens only. No emoji. Sticker-shadow aesthetic consistent with `Pill`.
- `FileTagsEditor` is client-component with optimistic add / revert-on-error remove.
- Chips show on file-detail page only in v1 (NOT on grid tiles).

- [ ] **Step 1: Write failing `TagChip` test**

```tsx
// app/src/components/TagChip.test.tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagChip } from "./TagChip";

describe("TagChip", () => {
  it("renders the name prefixed with #", () => {
    render(<TagChip name="valheim" />);
    expect(screen.getByText("#valheim")).toBeTruthy();
  });
  it("wraps label in Link when href is provided", () => {
    render(<TagChip name="valheim" href="/?tag=abc" />);
    const anchor = screen.getByText("#valheim").closest("a");
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute("href")).toBe("/?tag=abc");
  });
  it("renders remove button when onRemove is provided", () => {
    const onRemove = vi.fn();
    render(<TagChip name="valheim" onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("remove tag valheim"));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd app && npx vitest run src/components/TagChip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `TagChip`**

```tsx
// app/src/components/TagChip.tsx
import Link from "next/link";
import styles from "./TagChip.module.css";

type Props = {
  name: string;
  href?: string;
  onRemove?: () => void;
};

export function TagChip({ name, href, onRemove }: Props) {
  const label = <span className={styles.label}>#{name}</span>;
  const labelSlot = href ? <Link href={href} className={styles.link}>{label}</Link> : label;
  return (
    <span className={styles.chip}>
      {labelSlot}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`remove tag ${name}`}
          onClick={onRemove}
        >×</button>
      )}
    </span>
  );
}
```

```css
/* app/src/components/TagChip.module.css */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--vv-bg-panel);
  border: 1.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-xl);
  padding: 2px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--vv-ink);
}
.link { color: inherit; text-decoration: none; }
.label { font-weight: 600; }
.remove {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0 2px;
  font-size: 16px;
  line-height: 1;
  color: var(--vv-ink-muted);
  cursor: pointer;
}
.remove:hover { color: var(--vv-ink); }
```

- [ ] **Step 4: Run TagChip test to verify pass**

Run: `cd app && npx vitest run src/components/TagChip.test.tsx`
Expected: PASS (3 green).

- [ ] **Step 5: Write failing `FileTagsEditor` test**

```tsx
// app/src/components/FileTagsEditor.test.tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileTagsEditor } from "./FileTagsEditor";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("FileTagsEditor", () => {
  it("adds a tag via POST and renders it", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, json: async () => ({ tag: { id: "t1", name: "valheim", created_at: "2026-01-01" } }),
    } as Response);
    render(<FileTagsEditor fileId="f1" initialTags={[]} />);
    fireEvent.change(screen.getByPlaceholderText("add tag…"), { target: { value: "Valheim" } });
    fireEvent.click(screen.getByText("add"));
    await waitFor(() => expect(screen.getByText("#valheim")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/files/f1/tags", expect.objectContaining({ method: "POST" }));
  });

  it("removes a tag via DELETE", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as Response);
    render(<FileTagsEditor fileId="f1" initialTags={[{ id: "t1", name: "valheim" }]} />);
    fireEvent.click(screen.getByLabelText("remove tag valheim"));
    await waitFor(() => expect(screen.queryByText("#valheim")).toBeNull());
  });

  it("shows inline error on invalid tag", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 400,
      json: async () => ({ error: "invalid tag name", reason: "tag names must be lowercase…" }),
    } as Response);
    render(<FileTagsEditor fileId="f1" initialTags={[]} />);
    fireEvent.change(screen.getByPlaceholderText("add tag…"), { target: { value: "Hello World" } });
    fireEvent.click(screen.getByText("add"));
    await waitFor(() => expect(screen.getByText(/lowercase/i)).toBeTruthy());
  });
});
```

- [ ] **Step 6: Run to verify fail**

Run: `cd app && npx vitest run src/components/FileTagsEditor.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement `FileTagsEditor`**

```tsx
// app/src/components/FileTagsEditor.tsx
"use client";
import { useState } from "react";
import { TagChip } from "./TagChip";
import styles from "./FileTagsEditor.module.css";

type Tag = { id: string; name: string };

export function FileTagsEditor({ fileId, initialTags }: { fileId: string; initialTags: Tag[] }) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const name = draft.trim();
    if (!name) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/files/${fileId}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.reason ?? body.error ?? "couldn't add that tag");
        return;
      }
      const body = await res.json();
      setTags((prev) => {
        if (prev.some((t) => t.id === body.tag.id)) return prev;
        return [...prev, { id: body.tag.id, name: body.tag.name }]
          .sort((a, b) => a.name.localeCompare(b.name));
      });
      setDraft("");
    } finally { setBusy(false); }
  }

  async function remove(tag: Tag) {
    const prev = tags;
    setTags((p) => p.filter((t) => t.id !== tag.id));
    const res = await fetch(`/api/files/${fileId}/tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) setTags(prev);
  }

  return (
    <div className={styles.row}>
      {tags.map((t) => <TagChip key={t.id} name={t.name} onRemove={() => remove(t)} />)}
      <div className={styles.addGroup}>
        <input
          className={styles.input}
          placeholder="add tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          disabled={busy}
        />
        <button type="button" onClick={add} disabled={busy || !draft.trim()} className={styles.addBtn}>add</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
```

```css
/* app/src/components/FileTagsEditor.module.css */
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.addGroup { display: inline-flex; gap: 4px; }
.input {
  font-family: var(--vv-font-ui);
  font-size: 12px;
  border: 1.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-xl);
  padding: 2px 10px;
  background: var(--vv-bg-panel);
  color: var(--vv-ink);
  min-width: 120px;
}
.addBtn {
  font: inherit; font-size: 12px;
  border: 1.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-xl);
  padding: 2px 10px;
  background: var(--vv-accent);
  color: var(--vv-bg);
  cursor: pointer;
}
.addBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: var(--vv-danger); font-size: 12px; width: 100%; }
```

- [ ] **Step 8: Run FileTagsEditor test to verify pass**

Run: `cd app && npx vitest run src/components/FileTagsEditor.test.tsx`
Expected: PASS (3 green).

- [ ] **Step 9: Render `FileTagsEditor` on `/f/:id`**

Open `app/src/app/(shell)/f/[id]/page.tsx`. After line 44 (parallel fetch), add `listTagsForFile`:

```ts
import { listTagsForFile } from "@/lib/tags";
import { FileTagsEditor } from "@/components/FileTagsEditor";

// Replace the existing Promise.all:
const [breadcrumbs, bookmarked, tags] = await Promise.all([
  file.folder_id ? getBreadcrumbs(file.folder_id) : Promise.resolve([]),
  isBookmarked(user.id, file.id),
  listTagsForFile(file.id),
]);
```

Then render the editor after the meta line (line 109), before `StarButton`:

```tsx
<FileTagsEditor
  fileId={file.id}
  initialTags={tags.map((t) => ({ id: t.id, name: t.name }))}
/>
```

- [ ] **Step 10: Build + smoke-test**

Run: `cd app && npm run build`. Expected: PASS. Then `npm run dev`, open `/f/<any-file-id>`, verify the editor renders under the title with the auto-applied uploader tag.

- [ ] **Step 11: Commit**

```bash
git add app/src/components/TagChip.tsx app/src/components/TagChip.module.css \
        app/src/components/TagChip.test.tsx \
        app/src/components/FileTagsEditor.tsx app/src/components/FileTagsEditor.module.css \
        app/src/components/FileTagsEditor.test.tsx \
        app/src/app/\(shell\)/f/\[id\]/page.tsx
git commit -m "feat(ui): TagChip + FileTagsEditor; render tags on /f/:id"
```

---

### Task 9: `FilterBar` + home page integration

**Files:**
- Create: `app/src/components/FilterBar.tsx`, `FilterBar.module.css`, `FilterBar.test.tsx`
- Modify: `app/src/app/(shell)/page.tsx` — fetch tags, render `FilterBar` above All Files, pass `tagId` to `listTopLevelItems`.

**Constraints:**
- FilterBar is client-side; uses `useRouter` + `useSearchParams` + `usePathname`.
- Single `<select aria-label="filter by tag">` dropdown. Uploader filter is gone (it's now a tag).
- `clear` link visible only when `?tag` is active.
- Renders only on `/` above the "all files" heading. `/recent` stays unchanged in v1.

- [ ] **Step 1: Write failing `FilterBar` test**

```tsx
// app/src/components/FilterBar.test.tsx
// @vitest-environment jsdom
import "@/../tests/component-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "./FilterBar";

const pushMock = vi.fn();
let spMock = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => spMock,
  usePathname: () => "/",
}));

describe("FilterBar", () => {
  beforeEach(() => {
    pushMock.mockReset();
    spMock = new URLSearchParams("");
  });

  it("updates URL with selected tag", () => {
    render(<FilterBar tags={[{ id: "t1", name: "valheim", file_count: 2 }]} />);
    fireEvent.change(screen.getByLabelText("filter by tag"), { target: { value: "t1" } });
    expect(pushMock).toHaveBeenCalledWith("/?tag=t1");
  });

  it("clear link returns to bare pathname", () => {
    spMock = new URLSearchParams("tag=t1");
    render(<FilterBar tags={[{ id: "t1", name: "valheim", file_count: 2 }]} />);
    fireEvent.click(screen.getByText("clear"));
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("does not show clear link when no filter active", () => {
    render(<FilterBar tags={[]} />);
    expect(screen.queryByText("clear")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd app && npx vitest run src/components/FilterBar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `FilterBar`**

```tsx
// app/src/components/FilterBar.tsx
"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./FilterBar.module.css";

type Tag = { id: string; name: string; file_count: number };

export function FilterBar({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tagId = sp.get("tag") ?? "";

  function update(nextTag: string) {
    const params = new URLSearchParams(sp.toString());
    if (nextTag) params.set("tag", nextTag); else params.delete("tag");
    // reset to page 1 on any filter change
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className={styles.bar}>
      <label className={styles.field}>
        <span className="vv-meta">tag</span>
        <select
          aria-label="filter by tag"
          value={tagId}
          onChange={(e) => update(e.target.value)}
          className={styles.select}
        >
          <option value="">all</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>#{t.name} ({t.file_count})</option>
          ))}
        </select>
      </label>
      {tagId && (
        <button type="button" onClick={() => update("")} className={styles.clear}>clear</button>
      )}
    </div>
  );
}
```

```css
/* app/src/components/FilterBar.module.css */
.bar { display: flex; gap: 16px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.field { display: inline-flex; gap: 6px; align-items: center; }
.select {
  font-family: var(--vv-font-ui);
  font-size: 13px;
  border: 1.5px solid var(--vv-ink);
  border-radius: var(--vv-radius-sm);
  background: var(--vv-bg-panel);
  color: var(--vv-ink);
  padding: 2px 6px;
}
.clear {
  font: inherit; font-size: 12px; text-decoration: underline;
  background: transparent; border: 0; cursor: pointer; color: var(--vv-accent);
}
```

- [ ] **Step 4: Run FilterBar test**

Run: `cd app && npx vitest run src/components/FilterBar.test.tsx`
Expected: PASS (3 green).

- [ ] **Step 5: Wire into `(shell)/page.tsx`**

Replace the body of the `Home` component (keep the imports):

```tsx
// app/src/app/(shell)/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTopLevelItems, listRecentTopLevelItems } from "@/lib/files";
import { listTopLevelFolders } from "@/lib/folders";
import { listAllTagsWithCounts } from "@/lib/tags";
import { FileCard } from "@/components/FileCard";
import { FolderTile } from "@/components/FolderTile";
import { NewFolderButton } from "@/components/NewFolderButton";
import { PaginationLink } from "@/components/PaginationLink";
import { RecentStrip } from "@/components/RecentStrip";
import { FilterBar } from "@/components/FilterBar";
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tag?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = 24;
  const tagId = params.tag || undefined;
  const hasFilter = !!tagId;

  const [recent, folders, data, tags] = await Promise.all([
    hasFilter ? Promise.resolve([]) : listRecentTopLevelItems(RECENT_STRIP_COUNT),
    hasFilter ? Promise.resolve([]) : listTopLevelFolders(),
    listTopLevelItems(page, limit, {
      extraOffset: hasFilter ? 0 : RECENT_STRIP_COUNT,
      tagId,
    }),
    listAllTagsWithCounts(),
  ]);

  const lastUpload = recent[0]?.created_at ?? null;
  const totalPages = Math.ceil(data.total / limit);

  return (
    <>
      <div className={styles.subheader}>
        <h1 className="vv-greeting">welcome back, <strong>{user.username}</strong>.</h1>
        {!hasFilter && recent.length > 0 && (
          <div className="vv-meta">
            <strong>{recent.length + data.total}</strong> items · last upload <strong>{relativeTime(lastUpload)}</strong>
          </div>
        )}
      </div>

      {!hasFilter && <RecentStrip items={recent} />}

      {!hasFilter && (
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
                  fileCount={f.direct_file_count} subfolderCount={f.direct_subfolder_count}
                  createdBy={f.created_by} parentId={null} />
              ))}
            </div>
          )}
        </section>
      )}

      <h2 className={`vv-section-label ${styles.sectionLabel}`}>all files</h2>
      <FilterBar tags={tags.map(t => ({ id: t.id, name: t.name, file_count: t.file_count }))} />

      {data.items.length > 0 ? (
        <>
          <div className={styles.grid}>
            {data.items.map((it) => it.kind === "folder" ? (
              <FolderTile key={`f-${it.id}`} id={it.id} name={it.name}
                fileCount={it.direct_file_count} subfolderCount={it.direct_subfolder_count}
                createdBy={it.created_by} parentId={null} />
            ) : (
              <FileCard key={`x-${it.id}`} file={it} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className={styles.pagination}>
              {page > 1 && (
                <PaginationLink href={`/?page=${page - 1}${tagId ? `&tag=${tagId}` : ""}`}>← prev</PaginationLink>
              )}
              <span>page {page} of {totalPages}</span>
              {page < totalPages && (
                <PaginationLink href={`/?page=${page + 1}${tagId ? `&tag=${tagId}` : ""}`}>next →</PaginationLink>
              )}
            </div>
          )}
        </>
      ) : !hasFilter && recent.length === 0 ? (
        <div className={styles.empty}>
          <h2 className="vv-title">drop the first file in the vault.</h2>
        </div>
      ) : (
        <p className={styles.foldersEmpty}>no files match this filter.</p>
      )}
    </>
  );
}
```

- [ ] **Step 6: Update `listTopLevelItems` integration tests with tagId case**

Append to `app/src/lib/files.topLevel.integration.test.ts`:

```ts
it("tagId filter drops folder branches and returns only tagged files", async () => {
  // Create a tag and attach to one of the loose files
  const tagRow = await fx.pool.query<{ id: string }>(
    `INSERT INTO tags (name) VALUES ('funny') RETURNING id`,
  );
  const soloFile = await fx.pool.query<{ id: string }>(
    `SELECT id FROM files WHERE original_name = 'solo.mp4'`,
  );
  await fx.pool.query(
    `INSERT INTO file_tags (file_id, tag_id, created_by) VALUES ($1, $2, $3)`,
    [soloFile.rows[0].id, tagRow.rows[0].id, userId],
  );

  const page = await listTopLevelItems(1, 50, { tagId: tagRow.rows[0].id });
  expect(page.items.every((i) => i.kind === "file")).toBe(true);
  expect(page.items).toHaveLength(1);
  expect((page.items[0] as { original_name: string }).original_name).toBe("solo.mp4");
  expect(page.total).toBe(1);
});
```

- [ ] **Step 7: Run full suite + build**

Run: `cd app && npm test -- --run && npm run build`
Expected: PASS (modulo known testcontainer-unavailable / ffprobe pre-existing skips).

- [ ] **Step 8: Commit**

```bash
git add app/src/components/FilterBar.tsx app/src/components/FilterBar.module.css \
        app/src/components/FilterBar.test.tsx \
        app/src/app/\(shell\)/page.tsx \
        app/src/lib/files.topLevel.integration.test.ts
git commit -m "feat(ui): FilterBar above All Files (tag-only); suppress Recent + Folders when filtering"
```

---

### Task 10: Backfill script + runbook entry

**Files:**
- Create: `app/scripts/backfill-batches-and-tags.ts`
- Create: `app/scripts/backfill-batches-and-tags.integration.test.ts`
- Modify: `VOREVAULT_MASTER_CONTEXT.md`

**Constraints:** Idempotent (re-running = no-op). Heuristic for batch backfill: top-level folders with 2+ files created within 60s of the folder's `created_at`. Tag backfill: every live file gets `#<uploader-username-tag>` attached (idempotent via existing `ON CONFLICT DO NOTHING`).

- [ ] **Step 1: Write failing integration test**

```ts
// app/scripts/backfill-batches-and-tags.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, stopPg, type PgFixture } from "../tests/pg";
import { runBackfill } from "./backfill-batches-and-tags";

let fx: PgFixture;
let userId: string;

beforeAll(async () => {
  fx = await startPg();
  const dbModule = await import("../src/lib/db");
  Object.defineProperty(dbModule, "pool", { value: fx.pool, writable: true });
  userId = (await fx.pool.query<{ id: string }>(
    `INSERT INTO users (discord_id, username) VALUES ('d-bf','ryan.17') RETURNING id`,
  )).rows[0].id;
}, 120_000);
afterAll(async () => { await stopPg(fx); });

describe("runBackfill", () => {
  it("backfills batches for clustered top-level folders", async () => {
    const f = (await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Cluster', NULL, $1) RETURNING id`,
      [userId],
    )).rows[0].id;
    // 3 files within 60s of folder created_at
    for (let i = 0; i < 3; i++) {
      await fx.pool.query(
        `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path, created_at)
         VALUES ($1, $2, $3, 'video/mp4', 1, '/x', (SELECT created_at + interval '${i * 10} seconds' FROM folders WHERE id = $2))`,
        [userId, f, `clip-${i}.mp4`],
      );
    }
    await runBackfill(fx.pool);
    const folderRow = await fx.pool.query<{ upload_batch_id: string | null }>(
      `SELECT upload_batch_id FROM folders WHERE id = $1`, [f],
    );
    expect(folderRow.rows[0].upload_batch_id).not.toBeNull();
    const filesBatched = await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM files WHERE folder_id = $1 AND upload_batch_id IS NOT NULL`, [f],
    );
    expect(filesBatched.rows[0].c).toBe(3);
  });

  it("does NOT backfill batches for sparse-time folders (<2 files in 60s)", async () => {
    const f = (await fx.pool.query<{ id: string }>(
      `INSERT INTO folders (name, parent_id, created_by) VALUES ('Sparse', NULL, $1) RETURNING id`,
      [userId],
    )).rows[0].id;
    await fx.pool.query(
      `INSERT INTO files (uploader_id, folder_id, original_name, mime_type, size_bytes, storage_path)
       VALUES ($1, $2, 'only.mp4', 'video/mp4', 1, '/x')`,
      [userId, f],
    );
    await runBackfill(fx.pool);
    const row = await fx.pool.query<{ upload_batch_id: string | null }>(
      `SELECT upload_batch_id FROM folders WHERE id = $1`, [f],
    );
    expect(row.rows[0].upload_batch_id).toBeNull();
  });

  it("auto-tags every live file with the uploader's username tag", async () => {
    await runBackfill(fx.pool);
    const tagged = await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c
         FROM files f
         JOIN file_tags ft ON ft.file_id = f.id
         JOIN tags t ON t.id = ft.tag_id
        WHERE t.name = 'ryan-17' AND f.deleted_at IS NULL`,
    );
    expect(tagged.rows[0].c).toBeGreaterThan(0);
  });

  it("is idempotent on repeat runs", async () => {
    await runBackfill(fx.pool);
    const firstCount = (await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM upload_batches`,
    )).rows[0].c;
    await runBackfill(fx.pool);
    const secondCount = (await fx.pool.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM upload_batches`,
    )).rows[0].c;
    expect(secondCount).toBe(firstCount);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `cd app && npx vitest run scripts/backfill-batches-and-tags.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `runBackfill`**

```ts
// app/scripts/backfill-batches-and-tags.ts
import type { Pool } from "pg";
import { usernameToTag } from "../src/lib/username-to-tag";
import { normalizeTagName } from "../src/lib/tags";

/**
 * One-time migration:
 *  - Pass 1: detect time-clustered top-level folders, create batch rows, stamp
 *    descendants within the time window.
 *  - Pass 2: auto-tag every live file with its uploader's normalized username.
 * Safe to re-run.
 */
export async function runBackfill(pool: Pool): Promise<void> {
  // Pass 1 — batch backfill
  const candidates = await pool.query<{
    folder_id: string;
    created_at: Date;
    created_by: string;
    clustered_count: number;
  }>(
    `SELECT f.id AS folder_id, f.created_at, f.created_by,
            (SELECT count(*)::int FROM files x
              WHERE x.folder_id = f.id
                AND x.deleted_at IS NULL
                AND x.created_at BETWEEN f.created_at - interval '60 seconds'
                                     AND f.created_at + interval '60 seconds'
            ) AS clustered_count
       FROM folders f
      WHERE f.parent_id IS NULL
        AND f.deleted_at IS NULL
        AND f.upload_batch_id IS NULL`,
  );

  for (const c of candidates.rows) {
    if (c.clustered_count < 2) continue;

    // Create batch with folder's created_at as authoritative time, top_folder = this folder.
    const batch = await pool.query<{ id: string }>(
      `INSERT INTO upload_batches (uploader_id, top_folder_id, created_at)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [c.created_by, c.folder_id, c.created_at],
    );
    const batchId = batch.rows[0].id;

    // Stamp the top folder.
    await pool.query(
      `UPDATE folders SET upload_batch_id = $1 WHERE id = $2 AND upload_batch_id IS NULL`,
      [batchId, c.folder_id],
    );

    // Stamp descendant folders whose created_at is within the window.
    await pool.query(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM folders WHERE parent_id = $2
         UNION ALL
         SELECT fo.id FROM folders fo JOIN tree ON fo.parent_id = tree.id
       )
       UPDATE folders SET upload_batch_id = $1
        WHERE id IN (SELECT id FROM tree)
          AND upload_batch_id IS NULL
          AND created_at BETWEEN $3 - interval '60 seconds'
                             AND $3 + interval '60 seconds'`,
      [batchId, c.folder_id, c.created_at],
    );

    // Stamp files whose folder is the top folder OR a descendant and created_at is in window.
    await pool.query(
      `WITH RECURSIVE tree(id) AS (
         SELECT id FROM folders WHERE id = $2
         UNION ALL
         SELECT fo.id FROM folders fo JOIN tree ON fo.parent_id = tree.id
       )
       UPDATE files SET upload_batch_id = $1
        WHERE folder_id IN (SELECT id FROM tree)
          AND upload_batch_id IS NULL
          AND created_at BETWEEN $3 - interval '60 seconds'
                             AND $3 + interval '60 seconds'`,
      [batchId, c.folder_id, c.created_at],
    );
  }

  // Pass 2 — auto-tag every live file with uploader's username tag
  const files = await pool.query<{
    file_id: string;
    uploader_id: string;
    username: string;
  }>(
    `SELECT f.id AS file_id, f.uploader_id, u.username
       FROM files f JOIN users u ON u.id = f.uploader_id
      WHERE f.deleted_at IS NULL`,
  );
  for (const r of files.rows) {
    const tagName = usernameToTag(r.username);
    if (!tagName) continue;
    let normalized: string;
    try { normalized = normalizeTagName(tagName); } catch { continue; }

    const tag = await pool.query<{ id: string }>(
      `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
      [normalized],
    );
    await pool.query(
      `INSERT INTO file_tags (file_id, tag_id, created_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [r.file_id, tag.rows[0].id, r.uploader_id],
    );
  }
}

// CLI entry: `npx tsx app/scripts/backfill-batches-and-tags.ts`
if (require.main === module) {
  (async () => {
    const { pool } = await import("../src/lib/db");
    console.log("running backfill…");
    await runBackfill(pool as unknown as Pool);
    console.log("done.");
    process.exit(0);
  })().catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd app && npx vitest run scripts/backfill-batches-and-tags.integration.test.ts`
Expected: PASS (4 green).

- [ ] **Step 5: Add runbook entry to `VOREVAULT_MASTER_CONTEXT.md`**

Find the Operations / Maintenance section and add:

```markdown
### One-time migration: upload batches + uploader auto-tags

After deploying the home-feed-and-tagging feature, run the backfill once from the
app host:

```bash
# Inside the app container or host, with DATABASE_URL in env
cd /path/to/repo
npx tsx app/scripts/backfill-batches-and-tags.ts
```

The script is idempotent — safe to re-run if it fails partway. It:
- Creates `upload_batches` rows for any top-level folder with 2+ files clustered
  within 60s of the folder's `created_at`, then stamps the folder's descendants
  and clustered files with the batch id.
- Attaches an `#<uploader-username>` tag (normalized via `usernameToTag`) to
  every live file that doesn't already have it.
```

- [ ] **Step 6: Commit**

```bash
git add app/scripts/backfill-batches-and-tags.ts \
        app/scripts/backfill-batches-and-tags.integration.test.ts \
        VOREVAULT_MASTER_CONTEXT.md
git commit -m "feat(ops): backfill script for upload batches + uploader auto-tags"
```

---

### Task 11: Final verification

- [ ] **Step 1: Clean up the superseded tags plan**

Delete the older plan so agents don't get confused:

```bash
git rm docs/superpowers/plans/2026-04-24-tags.md
git commit -m "docs: remove superseded tags plan (replaced by home-feed-and-tagging)"
```

- [ ] **Step 2: Full test + build**

Run: `cd app && npm test -- --run && npm run build`
Expected: all green (pre-existing testcontainer/ffprobe skips acceptable).

- [ ] **Step 3: Health check**

Run: `cd app && npm run dev` (or rebuild docker stack), then `curl http://localhost:3000/api/health`.
Expected: `{"ok":true}` (or whatever the existing health handler returns).

- [ ] **Step 4: Manual E2E smoke** (check each in a real browser)

- [ ] Drop a folder tree at root → 1 folder tile appears in Recent; opening `/f/<any-inner-file>` shows the `#<your-username>` tag already attached.
- [ ] Drop a single file into an existing folder → the file tile (not the parent folder) appears in Recent.
- [ ] On `/f/:id`, add a tag `Valheim` → chip appears; reload preserves.
- [ ] Click × on a chip → chip disappears; reload confirms.
- [ ] Add `Hello World!` → inline error explains format.
- [ ] On `/`, select `#valheim` in the filter dropdown → Recent + Folders disappear; All Files narrows to tagged files; URL shows `?tag=<id>`; pagination preserves `tag`.
- [ ] Click "clear" → filter resets; Recent + Folders return.
- [ ] Browser back button restores the prior filter state.
- [ ] Run the backfill script against a scratch DB → legacy top-level folders with 2+ clustered files get batch rows; every live file gains a `#<normalized-username>` tag.

- [ ] **Step 5: Open PR**

```bash
git push -u origin feat/home-feed-and-tagging
gh pr create --title "feat: batch-aware home feed + flat tagging (uploader auto-tag)"
```

Include in the PR description: the deploy runbook entry pointer + the manual smoke checklist above.

---

## Self-Review Notes

- **Uploader-as-tag** means there's no separate uploader filter. If users want to filter "by Alice" they select `#alice` from the tag dropdown. The list mixes people with game/category tags; acceptable for a small group per design decision.
- **Tag uniqueness is global.** If an uploader's normalized-username collides with a game tag (`ryan.minecraft` exists; someone adds `#minecraft` manually), they share one tag row — `minecraft` filters to both the game clips and files uploaded by that user. Document as a known quirk; acceptable for v1.
- **Legacy fallback in `listTopLevelItems`** covers user-home folders, manually-created folders, and pre-migration folder uploads. Post-backfill, legacy folders with real clustered uploads become batches; the fallback then only covers true manual/home folders. No cleanup needed — the query naturally de-duplicates by `WHERE upload_batch_id IS NULL`.
- **tus metadata** is an untrusted client input. The hook validates via `uuidRegex` before using `upload_batch_id`; an attacker setting a random UUID just means their file gets orphaned from a non-existent batch (branch B excludes it from the feed). Mild DoS vector — negligible for a small-group app.
- **Tags on grid tiles** are deferred; the tag array is already threaded through `TopLevelFileItem.tags` so a v2 UI pass only needs the render work.
- **60-second clustering window** in backfill is a heuristic. The `ui` plan calls out that it's best-effort for legacy data only; new uploads have exact tracking via `upload_batch_id`.
- **`/recent` layout** is untouched. It inherits the new `listTopLevelItems` behavior for free — a future plan can add a FilterBar there if desired.
