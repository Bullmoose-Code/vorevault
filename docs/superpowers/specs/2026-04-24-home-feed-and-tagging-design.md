# Home Feed (batch-aware) + Tagging — Design

> **Status:** approved via brainstorming session on 2026-04-24. Next step: `superpowers:writing-plans` produces the task-by-task implementation plan.

## Problem

The home page shows three sections — **Recent**, **Folders**, **All Files** — but Recent and Folders visibly duplicate each other. Both read from "top-level folders ordered by `created_at`." Whenever a user's recent activity is folder uploads, the two sections are indistinguishable. Worse: a file dropped into an existing folder never reaches Recent at all, because its parent folder's `created_at` hasn't moved.

Layered on top: there is no way to find clips by game or by uploader beyond remembering folder names. The group wants tags.

## Goals

1. **Recent shows actual uploads.** Each loose-file upload is its own tile. A folder upload collapses to one folder tile (no matter how many files / nested subfolders it contains).
2. **Bring back a paginated "All Files"** grid using the same activity-feed semantics.
3. **Flat tagging.** Anyone can attach short lowercase tags (`valheim`, `funny`, `tutorial`) to any file. Filter by tag at the "All Files" grid.
4. **Uploader is a tag, not a separate axis.** Every file is auto-tagged with `#<username>` at upload time; one filter dimension in the UI.

## Non-goals (deferred)

- Auto-routing loose uploads into a username folder (separate upload-flow feature).
- Tag chips on grid tiles (visual polish; tags show on the file-detail page only in v1).
- Folder tags / polymorphic tagging.
- Tag rename / merge / admin UI.
- Tag autocomplete in the editor.
- Changing `/recent`'s layout (it picks up the new `listTopLevelItems` automatically).

---

## Approach

Two independent schema additions that compose:

- **Upload batches** give every folder-upload a stable unit. The home feed can then render *"one tile per batch top folder"* instead of "top-level folder."
- **Tags** are a flat lowercase namespace. Uploader-as-tag is applied automatically so the filter UI stays one-dimensional.

---

## Data model

### `upload_batches`

```sql
-- db/init/07-upload-batches.sql
CREATE TABLE upload_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  top_folder_id   uuid REFERENCES folders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE files   ADD COLUMN upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;
ALTER TABLE folders ADD COLUMN upload_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;

CREATE INDEX files_upload_batch_idx   ON files   (upload_batch_id) WHERE upload_batch_id IS NOT NULL;
CREATE INDEX folders_upload_batch_idx ON folders (upload_batch_id) WHERE upload_batch_id IS NOT NULL;
```

Invariants:

- A batch row is created **only** when the drop is a folder tree. Loose uploads never create batch rows; their files stay `upload_batch_id IS NULL`.
- `top_folder_id` = the folder the user actually dragged. If they dragged `session-1/` into an existing `Valheim/`, `top_folder_id` = `session-1` (not `Valheim`).
- Every file created during a folder upload is stamped with the batch id. So is every folder created (top + subfolders).
- `ON DELETE SET NULL` keeps batches resilient to trash/purge; orphan batches get cleaned up in the migration script below (optional future work).

### `tags` + `file_tags`

```sql
-- db/init/08-tags.sql
CREATE TABLE tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE
               CHECK (name ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_tags (
  file_id    uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (file_id, tag_id)
);

CREATE INDEX file_tags_tag_id_idx  ON file_tags (tag_id);
CREATE INDEX file_tags_file_id_idx ON file_tags (file_id);
```

Tag rules:

- Lowercase letters, digits, hyphens. Cannot start with hyphen. 1–32 chars.
- Globally unique by name; reused across files.
- Attach is idempotent (`ON CONFLICT DO NOTHING` on `file_tags`, `ON CONFLICT DO UPDATE` stub on `tags`).
- Anyone in the group can attach/detach on any file (shared-pool principle).

---

## Server-side listing

### `listTopLevelItems(page, limit, opts)`

Signature change (options object):

```ts
export type TopLevelOptions = {
  extraOffset?: number;
  tagId?: string;
};

export async function listTopLevelItems(
  page: number,
  limit: number,
  opts: TopLevelOptions = {},
): Promise<TopLevelPage>
```

Unified SQL:

```sql
SELECT * FROM (
  -- A. Folder tiles: one per live upload batch whose top_folder still exists.
  --    Suppressed when a tag filter is active (folders aren't tagged).
  SELECT 'folder' AS kind,
         f.id, f.name, f.parent_id, f.created_by,
         b.created_at,                                 -- batch time, not folder.created_at
         (SELECT count(*) FROM files x
            WHERE x.folder_id = f.id AND x.deleted_at IS NULL) AS direct_file_count,
         (SELECT count(*) FROM folders s
            WHERE s.parent_id = f.id AND s.deleted_at IS NULL) AS direct_subfolder_count,
         NULL…  -- file-only fields
    FROM upload_batches b
    JOIN folders f ON f.id = b.top_folder_id
   WHERE f.deleted_at IS NULL
     AND NOT :has_tag_filter   -- pseudo: omit this branch entirely when tagId set

  UNION ALL

  -- B. File tiles: every live file NOT part of a folder upload.
  SELECT 'file' AS kind,
         ff.id, …, ff.created_at,
         array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL) AS tags
    FROM files ff
    JOIN users u ON u.id = ff.uploader_id
    LEFT JOIN file_tags ft ON ft.file_id = ff.id
    LEFT JOIN tags t ON t.id = ft.tag_id
   WHERE ff.deleted_at IS NULL
     AND ff.upload_batch_id IS NULL
     AND (:tag_id IS NULL OR EXISTS (
           SELECT 1 FROM file_tags ft2
            WHERE ft2.file_id = ff.id AND ft2.tag_id = :tag_id))
   GROUP BY ff.id, u.username
) t
ORDER BY created_at DESC
LIMIT $1 OFFSET $2
```

Key behaviors:

1. Folder upload = exactly **1** row (the `top_folder`), regardless of file / subfolder count.
2. Loose files — at root or dropped individually into any folder — appear as own tiles.
3. When `tagId` is set, branch A disappears entirely and branch B filters by tag.
4. `total` count honors the same filters (separate count query with matching predicates).
5. `listTopLevelFolders` (Folders grid) stays unchanged — all live top-level folders regardless of batch origin.

### Tags module — `app/src/lib/tags.ts`

Exports: `normalizeTagName`, `TagNameError`, `attachTagToFile`, `detachTagFromFileById`, `listTagsForFile`, `listAllTagsWithCounts`. Modeled on the existing `docs/superpowers/plans/2026-04-24-tags.md` plan; that plan is the reference for SQL and error handling.

### `usernameToTag(username): string | null`

Pure helper. Lowercase → replace `[^a-z0-9]` with `-` → collapse runs → trim leading/trailing `-` → cap 32 chars → return `null` if empty.

Examples:
- `"Ryan_vander.17"` → `"ryan-vander-17"`
- `"alex"` → `"alex"`
- `"___"` → `null` (skip auto-tag)

---

## Upload pipeline changes

Only the **folder-upload** path changes; loose uploads are untouched except for the auto-tag hook at the end.

### Folder upload flow

1. Client collects dropped items via `collectDroppedItems` (existing).
2. **New:** `POST /api/upload-batches` with `{ topFolderName, destParentId }` → server creates:
   - An `upload_batches` row (uploader = current user, `top_folder_id` NULL placeholder).
   - The top folder under `destParentId`, stamped with the batch id.
   - *If* the client also passes the subfolder tree, the server creates each subfolder stamped with the same batch id. (Either include this here, or keep `folder-tree-create.ts` responsible and have it accept a `batchId` param — implementation detail, plan phase picks one.)
   - Update batch row: `top_folder_id = <id>`.
3. Response: `{ batchId, topFolderId, folderMap }`.
4. Client enqueues tus uploads, passing `metadata.upload_batch_id = batchId` on each file.
5. tus finalize hook (`api/hooks/tus`):
   - Insert `files` row with `upload_batch_id` from metadata.
   - Call `attachTagToFile(fileId, usernameToTag(uploader.username), uploader.id)` if the result is non-null. Failure is logged but non-fatal.

### Loose upload flow

1. No batch row.
2. tus finalize: insert `files` row (`upload_batch_id = NULL`) → auto-tag with username tag.

### Trash / restore interaction

- Trashing a top-level folder cascades via existing logic; the batch's `top_folder_id` becomes effectively inert (the JOIN against `folders` will filter it out via `deleted_at IS NULL`).
- Restoring the top folder brings the batch tile back.
- Permanent-delete of a folder sets `batch.top_folder_id` to NULL via `ON DELETE SET NULL`; any files still alive in that orphan batch effectively hide from the home feed (they have a batch id so branch B excludes them, and branch A has no folder to show). *Mitigation:* in the permanent-delete path, if the folder had a batch and no other folders, also delete the batch row. Details in implementation plan.

---

## UI

### Home page — `app/src/app/(shell)/page.tsx`

```
┌──────────────────────────────────────┐
│ welcome back, <user>.                │
├──────────────────────────────────────┤
│ RECENT  →   view all                 │
│ [tile × 6]                           │  ← mixed feed, folder + file tiles
├──────────────────────────────────────┤
│ FOLDERS                    + new     │
│ [folder grid]                        │  ← unchanged — all top-level folders
├──────────────────────────────────────┤
│ ALL FILES                            │
│ [ tag: all ▾  ] clear                │  ← FilterBar lives here only
│ [tile grid, paginated, offset 6]     │
│ ← prev  page 1 of N  next →          │
└──────────────────────────────────────┘
```

- Recent strip: 6 most recent items from the activity feed.
- Folders grid: unchanged.
- All Files grid: same feed as Recent, paginated 24/page, **offset 6** (keeps current non-duplication behavior).
- When `?tag=<id>` is set, the Folders section stays visible (overview) but All Files filters and hides folder tiles.

### Components

- `TagChip` — small pill, border `1.5px var(--vv-ink)`, bg `var(--vv-bg-panel)`, radius `var(--vv-radius-xl)`. Optional `onRemove` shows `×` button. `href` wraps the label with a `Link` to `/?tag=<id>`.
- `FileTagsEditor` — client component on `/f/:id`. Chip row + "add tag…" input + "add" button. `Enter` submits. Optimistic UI, revert on error. Inline error from 400 responses.
- `FilterBar` — client component. Single `<select aria-label="filter by tag">` wired to `?tag=<id>`. Uses `useRouter` + `useSearchParams` + `usePathname`. `clear` link visible only when active. Rendered **only** above the All Files heading on `/` (not on `/recent` in v1).

### Where tags appear

| Location | v1 |
|---|---|
| `/f/:id` | Full chip row + editor |
| Grid tiles | ❌ (deferred for v2) |
| Recent strip | ❌ |
| Sidebar / Filter dropdown | ✅ (count per tag) |

---

## API

- `POST /api/upload-batches` — `{ topFolderName, destParentId? }` → `{ batchId, topFolderId, folderMap? }`. Auth required.
- `GET /api/tags` — `[{ id, name, file_count }]` sorted by name. Auth required.
- `POST /api/files/:id/tags` — body `{ name }` (`z.string().min(1).max(64)`). Attaches. 400 on `TagNameError` with `{ error, reason }`. 404 if file missing/trashed. 401 unauthenticated.
- `DELETE /api/files/:id/tags/:tagId` — detaches. 404 if file missing. 401 unauthenticated.

---

## Backfill script — `app/scripts/backfill-batches-and-tags.ts`

One-time migration, idempotent, runnable manually pre-deploy.

**Pass 1 — batches.** For each top-level folder `F` with no `upload_batch_id`:
- Walk its descendants (files + nested folders) via the existing recursive SQL pattern.
- Identify the "folder upload time cluster": files where `|file.created_at − F.created_at| ≤ 60s`.
- If ≥ 2 such files exist, create a batch (`uploader_id = F.created_by`, `top_folder_id = F.id`, `created_at = F.created_at`), then stamp `upload_batch_id` on `F`, its descendant folders (same time window), and the clustered files.
- Else skip (those files remain loose — best-effort heuristic, documented).

**Pass 2 — auto-username tags.** For every live file without an `#<uploader_username>` tag:
- Compute `usernameToTag(uploader.username)`.
- If non-null, `attachTagToFile`.

Idempotency: both passes check existing state before acting. Re-running the script is safe.

Runbook entry goes into `VOREVAULT_MASTER_CONTEXT.md` alongside other ops steps.

---

## Testing strategy

Per `CLAUDE.md`: TDD, testcontainers for DB tests, no DB mocks.

### Unit (pure, no DB)

- `normalizeTagName` — lowercases, trims, rejects invalid, caps at 32, rejects leading hyphen.
- `usernameToTag` — Discord punctuation (`.`, `_`), all-digit usernames, all-punctuation → `null`, 33+ chars capped.
- `FilterBar` URL helpers (merging params, preserving unrelated query).

### Integration (testcontainers Postgres)

- Schema loads (`tests/schema.test.ts` catches syntax errors).
- `listTopLevelItems`:
  - Folder upload → 1 row (batch top folder), not N.
  - Loose files at root and in existing folders → individual rows.
  - Ordering by `created_at DESC` across mixed rows.
  - `tagId` filter drops folder branch and returns only matching files.
  - `total` count matches filters.
- `attachTagToFile` / `detachTagFromFileById` — idempotent, invalid name throws.
- Auto-tag in finalize hook — inserting a file under uploader X results in `#<x-normalized>` attached.
- Backfill script — given a fixture DB with pre-batch folders + timestamp clusters, produces expected batches and tag attachments; second run is a no-op.

### Component (jsdom + @testing-library/react)

- `FileTagsEditor` — add POSTs + optimistic UI; remove DELETEs + revert on failure; inline error on 400.
- `FilterBar` — select change calls `router.push("/?tag=<id>")`; clear resets to `/`.
- `TagChip` — renders `#name`; `onRemove` click fires handler; `href` wraps label with `Link`.

### E2E smoke (manual, in PR description)

- Drop a folder tree at root → 1 folder tile in Recent, inner files carry uploader's `#<username>` tag.
- Drop a loose file into an existing folder → file tile appears in Recent (parent folder does not resurface).
- Tag a file on `/f/:id` → tag appears in `GET /api/tags` with count +1.
- Filter All Files by tag → grid narrows, folders disappear from that section, URL reflects state, back button restores.

---

## Build order (writing-plans will break this into tasks)

1. Schema: `db/init/07-upload-batches.sql` + alters.
2. `uploadBatches` DB helpers + integration tests.
3. Folder-tree upload: thread `batchId` through `folder-tree-create.ts`; stamp folders + tus metadata; tus hook honors `upload_batch_id`.
4. Rewrite `listTopLevelItems` SQL (batch-aware branch A + loose-file branch B). Update callers.
5. Home page shape refresh: strip + folders + All Files paginated with offset.
6. Schema: `db/init/08-tags.sql`. `normalizeTagName` + unit tests.
7. Tags DB helpers + integration tests + API routes (`/api/tags`, `/api/files/:id/tags*`).
8. `usernameToTag` + auto-tag in tus finalize hook + integration test.
9. `TagChip` + `FileTagsEditor` + render on `/f/:id`. Component tests.
10. `FilterBar` above All Files only. Extend `listTopLevelItems` with `tagId`. Component + integration tests.
11. Backfill script + integration test + runbook entry in `VOREVAULT_MASTER_CONTEXT.md`.

Final verification: `npm test && npm run build && curl /api/health`.

---

## Open implementation-level questions (for writing-plans)

- Does `folder-tree-create.ts` take a `batchId` param, or does `/api/upload-batches` own the whole tree creation? (Prefer the former: one responsibility per endpoint.)
- Does `POST /api/upload-batches` create the top folder, or does the client call the existing folder-create endpoint then the batch endpoint in sequence? (Prefer atomic server-side creation to avoid orphan folders on failure.)
- Handling of permanent-delete of a batch's top folder: prune the batch row, or leave it NULL? (Prefer prune when no other folders reference it.)
- Exact SQL for branch A's folder-tile rows: pull `direct_file_count` live or denormalize? Current schema uses live counts; stick with that.

---

## Out-of-scope follow-ups (catalogued for later)

- Auto-routing loose uploads into a username folder.
- Tag chips on grid tiles.
- Tag autocomplete in the editor.
- Tag rename / merge admin UI.
- Folder tags.
- `/recent` layout overhaul (it picks up the new listing for free; any UI change is separate).
