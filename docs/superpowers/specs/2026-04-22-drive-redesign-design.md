# Drive-Style Redesign — Design Spec

**Date:** 2026-04-22
**Status:** Draft, pending user approval
**Source material:** Brainstorm session 2026-04-22 (mockups in `.superpowers/brainstorm/`)

## Goal

Re-skin VoreVault as a Google Drive analogue: persistent left sidebar with `+ new`, nav stack, expandable folder tree (labelled **vault**), and a global storage indicator. Add soft-delete (**trash**) with auto-purge. Replace the dedicated `/upload` route with inline `+ new` flows and a bottom progress drawer. Promote `?mine=1` and `/saved` to first-class sidebar destinations.

This is a chrome and structure change, not a rebuild. The data model, auth, tusd pipeline, design tokens, voice rules, and existing routes all stay. Folders, bookmarks, and search continue to work; they get new entry points.

## Scope

**In scope:**

- New `Sidebar` shell component (desktop persistent, mobile drawer).
- New `NewMenu` (`+ new` dropdown: new folder / upload file / upload folder), surfaced both in the sidebar and as a mobile FAB.
- New recursive folder upload flow (`<input webkitdirectory>` + folder-tree creation API).
- New `UploadProgressDrawer` (bottom-fixed, persists across navigation).
- New `VaultTree` recursive folder navigator in the sidebar.
- New `StorageBar` showing global vault usage.
- Soft-delete (trash) for files and folders with cascade and 30-day auto-purge.
- New `/trash` page and trash/restore/empty actions.
- New `/recent` and `/mine` pages (promoting existing inline filters).
- Rename `/saved` route and label to `/starred`.
- `TopBar` refactor: remove the upload pill (replaced by sidebar `+ new`).
- `UserChip` refactor: remove the admin link (moves to sidebar).
- Home page restructure: greeting → recent strip (6 thumbnails, no pagination) → folders grid → all clips paginated grid.
- Storage stats endpoint: `GET /api/storage/stats`.

**Out of scope:**

- Per-user quotas (deferred; storage bar shows global usage only).
- Drive-style "Shared with me" / multi-owner concepts.
- Drag-and-drop reordering or move-by-drag (existing FolderPicker stays).
- Comments, file activity timeline, or version history.
- Visual regression tooling.
- Public `/p/[token]` share-link UI changes (chrome only — those pages keep their current standalone layout).

## Architecture

### Layout shell

A new top-level layout wrapper inserts a sidebar between the topbar and content:

```
┌─────────────────────────────────────────────────────┐
│ TopBar:   [logo+vorevault]   [search──────]   [user]│
├──────────────┬──────────────────────────────────────┤
│ Sidebar      │                                      │
│ ┌──────────┐ │                                      │
│ │ + new    │ │       Page content (children)        │
│ └──────────┘ │                                      │
│   home       │                                      │
│   recent     │                                      │
│   starred    │                                      │
│   my uploads │                                      │
│   ─ vault ─  │                                      │
│   ▸ stunts   │                                      │
│   ▸ raids    │                                      │
│   trash      │                                      │
│   admin      │                                      │
│ ┌──────────┐ │                                      │
│ │ storage  │ │                                      │
│ └──────────┘ │                                      │
└──────────────┴──────────────────────────────────────┘
[              UploadProgressDrawer (when active)     ]
```

The shell lives in a new `app/(shell)` route group so login and public share pages can opt out by sitting outside the group:

- `app/(shell)/layout.tsx` — auth check + render `<TopBar/>`, `<Sidebar/>`, `<UploadProgressDrawer/>`, `{children}`
- `app/(shell)/page.tsx` — home (moved from `app/page.tsx`)
- `app/(shell)/recent/page.tsx`
- `app/(shell)/starred/page.tsx` — replaces `/saved`
- `app/(shell)/mine/page.tsx`
- `app/(shell)/trash/page.tsx`
- `app/(shell)/d/[id]/page.tsx` (moved)
- `app/(shell)/f/[id]/page.tsx` (moved)
- `app/(shell)/search/page.tsx` (moved)
- `app/(shell)/admin/...` (moved)
- `app/login/page.tsx` — stays outside the shell
- `app/p/[token]/page.tsx` — stays outside the shell

The `/saved` and `/upload` routes are removed. `/upload` is replaced by the inline `+ new` menu. Inbound links to `/saved` get a 308 redirect to `/starred` via `middleware.ts`.

### Sidebar component

`app/src/components/Sidebar.tsx` — server component for static nav structure, with a small client island for the `+ new` dropdown and the mobile drawer toggle.

Sections, top to bottom:

1. **`+ new` button** — sticker-style primary button. Click opens `NewMenu` dropdown anchored below it.
2. **Primary nav** — home, recent, starred, my uploads. Each is a `<Link>` with active styling driven by `usePathname()`.
3. **Vault tree** — `VaultTree` server component fetches the full folder tree once and renders it recursively. Each node is a link to `/d/[id]`. Expand/collapse state is local (client island per node).
4. **Trash** — link to `/trash`.
5. **Admin** — conditional on `user.is_admin`, links to `/admin`.
6. **Storage bar** — `StorageBar` client component fetches `/api/storage/stats` once on mount, renders bar + label. Refetches after upload completion (subscribes to UploadProgressDrawer events).

Mobile (≤768px): sidebar is hidden by default behind a hamburger toggle in the topbar. Tapping opens an overlay drawer. `+ new` becomes a floating action button (FAB) bottom-right; opens the same `NewMenu` as a centred modal.

### NewMenu

`app/src/components/NewMenu.tsx` — client component, three items:

1. **new folder** — opens existing `NewFolderDialog` with `parentId = null` (or current folder if user is on `/d/[id]`, derived from URL).
2. **upload file** — opens `FolderPickerModal` for destination → on confirm, opens native `<input type="file" multiple>` → for each file, creates a tusd upload session targeted at the picked folder → file rows appear in `UploadProgressDrawer`.
3. **upload folder** — opens `FolderPickerModal` for destination → on confirm, opens native `<input type="file" webkitdirectory>` → see "Recursive folder upload" below.

The folder picker prompt is required on every upload (not just folder uploads) — confirmed in brainstorm.

### Recursive folder upload

The browser exposes each picked file with a `webkitRelativePath` like `MyFolder/sub/clip.mp4`. The flow:

1. Group files by their relative subfolder paths (set of unique directories).
2. Send the directory tree to a new endpoint `POST /api/folders/tree` with body `{ parent_id, paths: ["MyFolder", "MyFolder/sub", "MyFolder/sub/deep"] }`. Server creates folders depth-first inside a transaction, returns `{ "MyFolder": "<uuid>", "MyFolder/sub": "<uuid>", ... }` mapping path → folder id.
3. For each file, look up its parent folder id from the map and start a tusd upload with that `folder_id` in the metadata.
4. Each upload is its own row in `UploadProgressDrawer`; cancellation is per-file.

If `/api/folders/tree` partially fails (e.g., one folder name collides), the whole transaction rolls back. UI shows an error and does not start any uploads.

### UploadProgressDrawer

`app/src/components/UploadProgressDrawer.tsx` — fixed bottom-right, collapsible. Holds a list of in-flight and recently-completed uploads. State lives in a React context provider (`UploadProgressProvider`) that wraps the shell so uploads survive navigation between pages.

Per-row UI: filename, progress bar, status (uploading / processing / done / failed), cancel button while uploading. Drawer auto-collapses 5 seconds after all uploads finish; user can reopen by clicking the collapsed pill.

When a row enters "done" state, fire a `vorevault:upload-done` browser event. `StorageBar` and any visible file/folder list listen for it and refetch.

### Trash

**Schema changes** (`db/init/06-trash.sql`, applied via the existing init mechanism on fresh installs; production gets a one-shot migration noted in the runbook):

```sql
ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS folders_deleted_at_idx ON folders (deleted_at) WHERE deleted_at IS NOT NULL;
-- Existing partial indexes on folders that filter active rows must be recreated WHERE deleted_at IS NULL.
```

`files.deleted_at` already exists. The existing `files_created_at_idx` and `files_folder_idx` are already partial on `WHERE deleted_at IS NULL`, which is the pattern we extend to folders.

**Active-set queries** — every existing query that lists files or folders gets `AND deleted_at IS NULL` if it doesn't already. The folder tree query (`listFolderTree`), `listTopLevelFolders`, `listFolderChildren`, `listFiles`, and the search trigram query all need this audit. Trashed folders should not appear in the picker, the vault tree, the home grid, or search.

**Authorization for delete-to-trash:**

- A file can be trashed by its `uploader_id` or any admin.
- A folder can be trashed by its `created_by` or any admin.
- Server enforces in `lib/files.ts` and `lib/folders.ts`. UI hides the trash button when not authorised, but the API is the source of truth.

**Cascade:** when a folder is trashed, all files and subfolders inside it are also marked `deleted_at = now()` in the same transaction. We mark them with the same timestamp so restore can re-group.

**Restore:** any signed-in user can restore any trashed item. (Trash is shared per the brainstorm decision; restore is low-risk because the data is recoverable.) On restore:

- File: clear `deleted_at`. If `folder_id` is set and that folder is also trashed, also clear `deleted_at` on the parent chain up to the first non-trashed ancestor (or root). This avoids restoring a file into a still-trashed folder.
- Folder restore is recursive within the original cascade group: find every descendant whose `deleted_at` matches this folder's `deleted_at` (same timestamp) and clear them all in one transaction. Items trashed at a different time stay trashed.

**Permanent delete (single item):** same auth as trash — uploader + admins for files, creator + admins for folders. Symmetric with trash so a non-owner can't bypass the trash restriction by waiting for someone else to trash and then deleting forever themselves. Hooks into the existing `cleanupExpiredFiles` path (`lib/cleanup.ts`).

**Empty trash:** admin only. This is catastrophic and irreversible across many items.

**Auto-purge:** bump `RETENTION_DAYS` in `lib/cleanup.ts` from 7 to 30. Add `cleanupExpiredFolders` analog: any folder whose `deleted_at < now() - 30 days` AND has no remaining child files or folders is hard-deleted. Files inside trashed folders are purged independently by `cleanupExpiredFiles`, so the folder eventually becomes empty and is collected on a later tick.

**API surface** (new):

- `POST /api/files/[id]/trash` — soft-delete one file.
- `POST /api/files/[id]/restore` — restore one file.
- `DELETE /api/files/[id]` — permanent delete (was previously the only delete path; semantics shift to "delete forever, only valid when already trashed").
- `POST /api/folders/[id]/trash` — soft-delete folder (cascade).
- `POST /api/folders/[id]/restore` — restore folder (cascade group).
- `DELETE /api/folders/[id]` — permanent delete folder + all descendants (only when already trashed).
- `GET /api/trash` — list trashed files and folders, newest first, paginated.

The existing `DELETE /api/files/[id]` route currently does the soft-delete-and-cleanup-later behavior. Its semantics change: callers must use `/trash` first, then `DELETE` is for permanent. UI never invokes `DELETE` directly except from the trash page.

### Storage stats

New endpoint `GET /api/storage/stats` returns:

```json
{ "used_bytes": 3001234567, "total_bytes": 11999999999999, "used_pct": 0.025 }
```

Implementation: `SELECT COALESCE(SUM(size_bytes), 0) FROM files WHERE deleted_at IS NULL` for `used_bytes`. For `total_bytes`, call `statvfs("/data")` via Node's `fs.statfs` and compute `f_blocks * f_frsize`. Cached for 60 seconds in-process to avoid hammering on rapid uploads.

### TopBar refactor

Remove the upload pill and its mobile collapse. Topbar becomes:

- Logo + brand wordmark on the left
- Search bar (already inline-on-desktop, overlay-on-mobile — keep as-is)
- Mobile: hamburger toggle (left of brand) for the sidebar drawer
- UserChip on the right (admin link removed)

Width: brand block = sidebar width (matches Drive). Search expands to fill the remaining space.

### Home page sections

`app/(shell)/page.tsx` renders:

1. Greeting `<h1>` (existing `vv-greeting` class).
2. Meta strip (existing `vv-meta` — total clips, total size, last upload time).
3. **Recent** — section label + horizontal grid of the 6 most recent clips (no pagination, no `mine` filter, "view all" link to `/recent`). New `RecentStrip` component reuses `FileCard`.
4. **Folders** — section label + top-level folders grid (existing `FolderTile`s and `NewFolderButton`). The button is preserved here for discoverability even though `+ new` is in the sidebar.
5. **All clips** — section label + the existing paginated grid, minus the 6 already shown in Recent (offset the query so we don't double-show).

The `?mine=1` query param is removed from `/`. "My uploads" is now its own page at `/mine` with the same grid layout but pre-filtered.

### Recent and Mine pages

Both are thin wrappers over `listFiles` with different filters. Same grid layout as home's "all clips" section. Pagination identical. No "Recent" extra concept (just `ORDER BY created_at DESC`).

### Starred page

Direct rename of `/saved` → `/starred`. Content unchanged. The `Bookmarks` lib stays named as-is internally.

### Trash page

`app/(shell)/trash/page.tsx` — lists trashed files and folders together, newest-trashed first. Each row shows: thumbnail/icon, original name, who trashed it, when, days remaining until purge. Two actions per row: **restore** (visible to all), **delete forever** (visible only to owner + admins). Header has an **empty trash** button visible to admins only; confirms with a modal.

### Voice and design tokens

All new labels lowercase, no emoji, no exclamation marks. Sticker (hard offset) shadow on the `+ new` button and the FAB only — sidebar items get no shadow (flat hover state). Storage bar uses `--vv-ink` for the fill and `--vv-cream-dark` for the track. No new tokens introduced. All copy:

- `+ new` (button)
- `new folder`, `upload file`, `upload folder` (menu items)
- `home`, `recent`, `starred`, `my uploads`, `vault`, `trash`, `admin` (sidebar)
- `2.8 GB of 11 TB` (storage bar) — the existing mono treatment via `vv-meta strong`
- `restore`, `delete forever`, `empty trash` (trash page)

## Data flow

**Trashing a folder (cascade):**

```
UI button → POST /api/folders/[id]/trash
            ↓
            lib/folders.ts: trashFolder(id, actor)
            ↓ in transaction:
              - check actor == created_by OR is_admin
              - SELECT recursive descendants
              - UPDATE folders SET deleted_at = $now WHERE id IN (...)
              - UPDATE files   SET deleted_at = $now WHERE folder_id IN (...)
            ↓
            { trashed: { folders: 4, files: 17 } }
```

**Recursive folder upload:**

```
NewMenu (upload folder)
  ↓ FolderPickerModal → parentFolderId
  ↓ webkitdirectory input → File[] with relativePaths
  ↓ POST /api/folders/tree { parent_id: parentFolderId, paths: [...] }
  ↓ ← { "MyFolder": "uuid1", "MyFolder/sub": "uuid2", ... }
  ↓ for each file:
      UploadProgressProvider.startUpload(file, folderId=map[file.relativeDir])
      ↓ tusd creates upload, hooks return file_id
      ↓ row updates as bytes flow
      ↓ on done, fire vorevault:upload-done event
```

**Storage bar refresh:**

```
StorageBar mounts → fetch /api/storage/stats → render
window.addEventListener('vorevault:upload-done', () => fetch + render)
```

## Error handling and edge cases

- **Recursive upload partial failure** — `/api/folders/tree` is all-or-nothing in a transaction. If creation fails (e.g., name collision with an existing sibling at the parent), no uploads start. UI surfaces the error from the response and recommends renaming or picking a different parent.
- **Trash a folder you don't own** — server returns 403, UI hides the option for non-owners/non-admins (but always re-checks server-side).
- **Restore a folder whose original parent is now trashed** — restore walks up the chain. If any ancestor is trashed at the same `deleted_at` timestamp, it was part of the same cascade and gets restored too. If an ancestor is trashed at a different timestamp, the restore lands the folder at the nearest non-trashed ancestor (or root).
- **Folder name collision on restore** — the unique index on `(parent_id, lower(name))` already prevents two folders with the same name in the same parent. If a sibling was created with the same name while this one was trashed, restore fails with a clear error: "a folder named X already exists here, rename one before restoring." We do not auto-rename.
- **Upload to a trashed folder** — should be impossible: the folder picker filters out trashed folders. Server defends the same way (`tusd` pre-create hook checks the target folder is not trashed).
- **Empty trash race** — the empty-trash button calls `/api/trash/empty` which permanent-deletes all trashed items in batches. If a user is restoring at the same time, last write wins; we accept this.
- **Storage bar showing 0% forever** — that's a feature for now (11 TB capacity, KB-scale usage). The bar uses a min-width on the fill so any non-zero value renders as a visible sliver.

## Testing

**Unit** (Vitest, mocked db):

- `lib/folders.ts`: trashFolder cascade behavior, restore cascade group resolution, restore name-collision error.
- `lib/storage.ts`: stats query with mixed deleted/active rows.
- `lib/cleanup.ts`: bumped RETENTION_DAYS, folder cleanup picks only empty folders past retention.
- `NewMenu`, `Sidebar`, `UploadProgressDrawer`: render + interaction tests with `@testing-library`.
- `VaultTree`: recursive render given a tree fixture, expand/collapse state.

**Integration** (testcontainers):

- Trash a folder with 3 nested subfolders and 5 files → verify all rows have matching `deleted_at`.
- Restore the top folder → verify all 8 rows clear `deleted_at`.
- Cleanup worker run after 31 days → verify hard-deleted.
- `POST /api/folders/tree` with a 3-deep path tree → verify map returned and all folders exist.

**Manual smoke** (browser, after deploy):

- Recursive upload of a real folder with a known structure (10–20 files across 3 dirs) — verify structure preserved.
- Trash → restore round trip on the upload above.
- Storage bar updates within 60 seconds of an upload finishing.
- Mobile drawer + FAB at <768px width.
- `/saved` redirects to `/starred`.

## Migration and rollout

This is a structural change — recommend a single PR (or, if it gets unwieldy, three: trash schema + cleanup, layout shell + nav, recursive upload). Decide once the plan is written.

**One-shot production migration** (added to runbook, run once after merge):

```sql
ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS folders_deleted_at_idx ON folders (deleted_at) WHERE deleted_at IS NOT NULL;
```

No backfill needed — all existing folders have `deleted_at = NULL`.

The 308 redirect from `/saved` to `/starred` covers any external bookmarks.

## What this design intentionally omits

- **Per-user quotas** — 11 TB / ~15 users; a quota system is solving a problem you don't have. Revisit if usage hits 30%.
- **Folder tree drag-and-drop reorder** — keep moves explicit via FolderPicker.
- **Trash filters / search** — trash is small and ephemeral; a flat list is fine.
- **Toast notifications outside the upload drawer** — restore/delete actions just navigate or refresh; no global toast system added.
- **Multi-select on file/folder grids** — single-select actions only. Bulk operations not in scope.
