# Desktop Watcher — Sub-project B: Folder watcher + tus upload pipeline

Implements the second of five sub-projects (A → B → C → D → E) of **Theme 1.1** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`. Sub-project A (auth + keychain) shipped 2026-04-26 as v0.1.0 of `vorevault-desktop`. This spec is the "make the app actually useful" lift: pick a folder once, drop files into it, they auto-upload to the vault silently while gaming.

## Goal

A user, signed in via the Sub-project A flow, can:

1. Click a tray menu item, pick a folder via the OS-native folder picker
2. Drop any file (video, image, anything) into that folder or any subfolder
3. The file uploads to their VoreVault home folder automatically, silently, no prompts
4. Files added while the app was off are caught on the next startup scan
5. Renames and copies of an already-uploaded file don't re-upload

**The app does NOT yet** show toast notifications (Sub-project C), have a settings window (Sub-project D), or ship signed installers (Sub-project E).

## Why now

v0.1.0 ships an auth-only desktop app — useful for proving the OAuth flow works but doing nothing visible to friends. Sub-project B ships v0.2.0: the first actually useful release. Friends can install once, configure once, then forget the app exists; clips appear in the vault without effort.

## Architecture

A pipeline of six new Rust modules in `src-tauri/src/`, plus updates to existing `tray.rs` + `main.rs`.

```
                                            ┌─────────────────────────────┐
                                            │  Tray menu                  │
                                            │  ─ Signed in as @ryan       │
                                            │  ─ Watching: <path>         │
                                            │  ─ Uploading 1 of 3…        │
   ┌───────────┐                            │  ─ ⚠ 2 failed (submenu)     │
   │  config   │ ◄────── tray pick ──────── │  ─ Pick folder…             │
   │  .json    │                            │  ─ Sign out                 │
   └─────┬─────┘                            │  ─ Quit                     │
         │ on startup                       └─────────────────────────────┘
         ▼
   ┌─────────────┐    notify::Watcher (recursive)
   │  watcher.rs │ ◄──────── Create / Modify / Rename events
   └─────┬───────┘
         │ debounced events
         │ (file stable for 5s)              ┌──────────────┐
         ▼                                   │ uploads.db   │
   ┌─────────────────┐    "have I uploaded   │ (SQLite)     │
   │  pipeline.rs    │     this before?"     └──────┬───────┘
   │  - in-mem queue │ ─────────────────────────────┤
   │  - 2 workers    │                              │
   └─────┬───────────┘     no → enqueue             ▲
         │                                          │
         ▼                                          │
   ┌─────────────┐  HTTPS tus  ┌────────────────────┴─────┐
   │ uploader.rs │ ──────────► │ vault.bullmoosefn.com    │
   └─────────────┘             │ /files/  (tusd v2)        │
                               └───────────────────────────┘
                                          │
                                          ▼
                                  post-finish hook
                                          │
                                          ▼
                                  vault DB row created
                                  (auto-tagged @username)
```

### Modules (all in `src-tauri/src/`)

| Module | Responsibility |
|---|---|
| `config.rs` | Read/write `config.json` at platform-default path. Atomic writes (temp + rename). Defaults if missing/corrupt. |
| `db.rs` | SQLite connection wrapper using `rusqlite`. One file, one table. Schema applied idempotently on startup. |
| `watcher.rs` | `notify` recursive watcher. Debounces events (5-second quiet period per path). Filters dotfiles + temp suffixes + symlinks + zero-byte files. Emits "ready" paths on a channel. |
| `uploader.rs` | tus protocol via raw `reqwest` (POST + PATCH chunks). Sends `Cookie: vv_session=<keychain token>` header. Filename in `Upload-Metadata`. |
| `pipeline.rs` | Owns the in-memory queue + N=2 worker threads. Pulls "ready" paths, dedupes via DB, hashes, dispatches to uploader, records on success. Owns retry/backoff state. |
| `dialogs.rs` | Native folder picker + Yes/No dialogs via `tauri-plugin-dialog`. |

Plus modifications to `tray.rs` (new menu items + dynamic state) and `main.rs` (start the pipeline on launch when a folder is configured).

### New dependencies

```toml
notify = "8"
rusqlite = { version = "0.32", features = ["bundled"] }
sha2 = "0.10"                        # already present
dirs = "5"
tauri-plugin-dialog = "2"
crossbeam-channel = "0.5"            # mpsc with select; better than std::sync::mpsc for the watcher debounce
```

## Configuration

### `config.json` shape

```json
{
  "watch_folder": "C:\\Users\\Ryan\\Videos\\Captures",
  "watch_recursive": true,
  "scan_existing_on_pick": true,
  "debounce_ms": 5000
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `watch_folder` | `string \| null` | no | `null` | Absolute path. `null` means "no folder configured yet" — pipeline doesn't start. |
| `watch_recursive` | `bool` | no | `true` | Locked to true for v0.2. Stored explicitly so a future settings UI can flip it. |
| `scan_existing_on_pick` | `bool` | no | `true` | The user's most-recent answer to the "upload existing files?" prompt at folder-pick time. Affects startup scan behavior on subsequent launches. |
| `debounce_ms` | `int` | no | `5000` | Milliseconds of file inactivity before considering a path "ready" for upload. |

### Path resolution (cross-platform)

Resolve the config directory via the `dirs` crate:

- Windows: `%APPDATA%\VoreVault\` (typically `C:\Users\<user>\AppData\Roaming\VoreVault\`)
- macOS: `~/Library/Application Support/VoreVault/`
- Linux: `~/.config/VoreVault/`

Both `config.json` and `uploads.db` live in this directory. Created on first launch if missing.

### Atomic writes

Config writes use a write-temp-then-rename pattern (`config.json.tmp` → `config.json`) so a crash mid-write doesn't corrupt the file. If the file is unreadable on startup (corrupt JSON, etc.), log a warning, back up the bad file as `config.json.broken-<timestamp>`, and start fresh with defaults.

## Persistent state — `uploads.db` (SQLite)

One table only:

```sql
CREATE TABLE IF NOT EXISTS uploaded_files (
  path TEXT PRIMARY KEY,           -- absolute, NFC-normalized
  size INTEGER NOT NULL,
  mtime_unix INTEGER NOT NULL,     -- file mtime at upload time
  sha256 TEXT NOT NULL,            -- hex-encoded
  uploaded_at INTEGER NOT NULL     -- our timestamp at upload completion
);

CREATE INDEX IF NOT EXISTS uploaded_files_sha256_idx
  ON uploaded_files (sha256);

CREATE INDEX IF NOT EXISTS uploaded_files_uploaded_at_idx
  ON uploaded_files (uploaded_at DESC);
```

**Why both `path` and `sha256`:**
- `path` PK → fast "have I seen this exact file?" check, used as the cheap first dedupe filter on every event.
- `sha256` index → catches renames + duplicate copies of the same file content. If a file's `(path, size, mtime)` doesn't match the DB but its sha256 does, INSERT a new path row pointing at the same content (so subsequent scans skip it) but DON'T re-upload.

**No `vault_file_id` column.** Tus's protocol doesn't return our DB UUID in the response, and v0.2 doesn't need it (no toast notifications yet, no "view in vault" links). Sub-project C will add the column + a server-side `X-Vault-File-Id` header when implementing toast notifications.

**No row deletion.** The table grows monotonically; ~200 bytes per row, 50,000 uploads ≈ 10 MB. SQLite handles that without effort. Future cleanup (e.g., garbage-collect rows whose `path` no longer exists on disk) is a Sub-project D-or-later concern.

**No row for failed uploads.** Failed-and-retrying files live in the in-memory queue only. If the app is killed mid-retry, the next startup scan re-discovers them (no DB row → re-enqueued).

## Upload pipeline

### Per-file flow

1. **Watcher event** — `notify` fires `Create`, `Modify`, or `Rename` on a path inside the watch tree.
2. **Debounce** — `watcher.rs` holds a `HashMap<PathBuf, Instant>`; reset the timer on any further event for the same path. After `debounce_ms` (5s default) of no events → emit "ready" on the channel.
3. **Pipeline pickup** — a worker thread in `pipeline.rs` receives the path:
   - `fs::metadata(path)` — drop if not a regular file (deleted, dir, symlink, zero-byte).
   - Skip if filename starts with `.` or matches `*.crdownload | *.part | *.tmp | *.partial`.
   - **Cheap dedupe:** `SELECT 1 FROM uploaded_files WHERE path=$1 AND size=$2 AND mtime_unix=$3`. If row exists, drop.
   - **Hash:** stream the file through `sha2::Sha256` (16 KB chunks). Compute hex digest.
   - **Content dedupe:** `SELECT 1 FROM uploaded_files WHERE sha256=$1`. If row exists: INSERT a new row at this `path` (so future scans skip), DON'T upload, drop.
4. **Upload** (`uploader.rs`):
   - `POST {VAULT_URL}/files/` with headers `Cookie: vv_session=<token>`, `Tus-Resumable: 1.0.0`, `Upload-Length: <bytes>`, `Upload-Metadata: filename <base64(filename)>`.
   - Server returns `201 Created` with `Location: {VAULT_URL}/files/<upload-id>`.
   - Loop: `PATCH {Location}` with 5 MB chunks, headers `Tus-Resumable: 1.0.0`, `Upload-Offset: <current>`, `Content-Type: application/offset+octet-stream`, body = next chunk. Server returns `204` with new `Upload-Offset`.
   - Last `PATCH` brings offset to `Upload-Length` → `204`. Server's `post-finish` hook fires asynchronously (registers the file in the vault DB).
5. **Record success:**
   ```sql
   INSERT INTO uploaded_files (path, size, mtime_unix, sha256, uploaded_at)
   VALUES ($1, $2, $3, $4, strftime('%s','now'))
   ON CONFLICT (path) DO UPDATE SET
     size=excluded.size, mtime_unix=excluded.mtime_unix,
     sha256=excluded.sha256, uploaded_at=excluded.uploaded_at;
   ```
6. **On failure** (network error, 5xx, timeout): bump retry counter for this path, schedule next attempt per backoff schedule, re-enqueue. No DB write.

### Concurrency

`N=2` worker threads pull from the in-memory queue. Compile-time constant for v0.2; settings UI (Sub-project D) can make it user-configurable. Two simultaneous uploads is enough to hide latency without saturating typical home upload bandwidth, and stays well under tusd's per-host connection limits.

### Backoff schedule

`[5s, 30s, 5m, 30m, 2h, 6h, 24h]`. After the 7th failure, mark the path as "failed (max retries)" in an in-memory `Vec<FailedFile>` (NOT persisted). Surfaced via the tray submenu. Restart re-queues — the next startup scan finds the path missing from the DB and tries again.

### Filters (silently skipped, never enqueued)

- Dotfiles: `.DS_Store`, `.crdownload`, `.part`, `.tmp`, `.partial`
- Symbolic links (avoid loops + ambiguity)
- Files larger than 100 GiB (the tusd `-max-size`)
- Zero-byte files (probably still being created; debounce should catch them but extra guard)

## Failure-mode matrix

| Failure | Pipeline behavior | User-visible signal |
|---|---|---|
| File temporarily locked (Windows: writer still has handle) | First PATCH may 5xx or hang. Retry per backoff. | None unless we hit max backoff (24h). |
| Network down at upload time | reqwest returns connection error → retry per backoff. | Tray status: "X queued" line in menu. |
| 401 from tus (session expired/revoked) | Stop retrying this file. Mark pipeline as auth-invalid → queue PAUSED. Tray flips to "Sign in" prompt. | "Signed out (session expired). Sign in." Queue resumes after re-sign-in. |
| 413 / file too big (somehow > 100 GiB) | Don't retry. Surface as "failed (too large)". | Tray badge "1 failed". Submenu lists path. |
| 5xx server error | Retry per backoff schedule. After 24h max → mark failed. | Same as above. |
| Path disappears mid-queue (file deleted before upload) | Drop silently. | None. |
| SQLite write failure | Log warning. Skip DB record — file may re-upload on next startup. | "1 failed (db error)". Rare. |
| Config file corrupt at startup | Back up corrupt file, reset to defaults. | "Watching: not configured". |
| Watch folder missing/deleted at startup | Pipeline doesn't start. | "⚠ Watch folder missing — Pick folder…" |

## Tray UX

The tray menu's items are dynamic, computed by `tray::refresh_menu`:

**Signed in, no folder configured:**
```
─ Signed in as @ryan
─────
─ Pick folder…
─────
─ Sign out
─ Quit VoreVault
```

**Signed in, folder configured, idle queue:**
```
─ Signed in as @ryan
─ Watching: C:\Users\Ryan\Videos\Captures
─────
─ Pick folder…    (lets user change it)
─────
─ Sign out
─ Quit VoreVault
```

**Signed in, folder configured, active uploads:**
```
─ Signed in as @ryan
─ Watching: C:\Users\Ryan\Videos\Captures
─ Uploading 1 of 3…    (disabled label)
─────
─ Pick folder…
─────
─ Sign out
─ Quit VoreVault
```

**Signed in, folder configured, failures present:**
```
─ Signed in as @ryan
─ Watching: C:\Users\Ryan\Videos\Captures
─ ⚠ 2 failed uploads     ← submenu listing the failed paths
─────
─ Pick folder…
─────
─ Sign out
─ Quit VoreVault
```

**Watch folder missing (configured but path doesn't exist):**
```
─ Signed in as @ryan
─ ⚠ Watch folder missing
─────
─ Pick folder…
─────
─ Sign out
─ Quit VoreVault
```

The "Watching:", "Uploading:", and "⚠ failed" lines are **disabled menu items** (text-only labels). The failed-uploads line is a submenu — clicking expands to filenames, one per row, also disabled (no per-file actions in v0.2). Refresh the menu on any state change (queue length, failure count, sign-in/out, pick).

The tray icon itself stays static. No spinner, no badge. Sub-project C adds toast notifications and a spinning state on active upload.

## Startup wiring

In `main.rs` `setup`:

1. Existing: install tray, refresh auth-state menu (Sub-project A behavior — unchanged).
2. **NEW:** if `config::load()` returns a valid path, spawn a worker thread that:
   - Initializes `db::open()` (creates `uploads.db` and applies schema if missing)
   - Verifies `config.watch_folder` exists; if not, set "watch folder missing" state and bail
   - Starts `watcher::start(path, debounce_ms, channel_tx)` — the recursive watcher
   - Starts `pipeline::start(N=2, channel_rx, db, vault_url, get_session_token_fn)` — the worker pool
   - Runs a one-shot recursive scan of the watch folder, enqueueing anything not in `uploads.db` (catches files added while app was off)
   - Refreshes tray menu

The pipeline subscribes to a separate "auth changed" channel from `tray.rs` so a sign-out tears down the pipeline cleanly and a fresh sign-in restarts it.

## Pick-folder flow

When user clicks "Pick folder…":

1. `dialogs::pick_folder()` opens the native OS folder picker via `tauri-plugin-dialog`.
2. If user cancels: no-op.
3. Recursive count files in the picked folder. If non-zero:
   - `dialogs::yes_no("Found N existing files in this folder. Upload them too? Choosing Yes will queue all N for upload.")`
   - User clicks Yes → `scan_existing_on_pick = true`. No → `false`.
4. Update `config.json` atomically with the new path + answer.
5. Tear down the existing pipeline (if any). Open a new `db` (already created), start fresh watcher + workers at the new path.
6. If `scan_existing_on_pick == true`: one-shot recursive scan + enqueue, deduped via DB (so picking a subfolder of a previously-watched folder doesn't double-upload).
7. Refresh tray menu.

## Out of scope

| Item | Where it goes |
|---|---|
| Toast notifications on upload success/failure | Sub-project C |
| Settings window UI | Sub-project D |
| Per-folder routing (different vault folders for different sources) | Roadmap item 1.2 |
| Tagging files at upload (beyond the auto uploader-username tag) | Sub-project D |
| Bandwidth/throughput limits | Defer until requested |
| Pause/resume button in tray | Defer; not requested |
| Retry-failed button in tray | Defer; restart re-tries |
| Move/delete file after upload | Defer; capture flows want local backup |
| Multiple watched folders | 1.2 (separate roadmap item) |
| Throttling on metered networks | Defer |
| `vault_file_id` column / "view in vault" tray links | Sub-project C (when toast notifications need them) |

## Testing

| Layer | Type | Coverage |
|---|---|---|
| `config::load`/`save` | Rust unit | Parse defaults, parse partial, write+read round-trip, corrupt-file backup-and-reset |
| `db::open` + dedupe queries | Rust integration (in-memory SQLite) | Schema applies idempotently, INSERT/SELECT behavior, sha256 dedupe path |
| `watcher` debounce logic | Rust unit | Multiple Modify events on same path → single ready emit; Modify on different paths → independent debounce timers |
| `uploader` URL building + headers | Rust unit | POST request shape (Tus-Resumable, Upload-Length, Upload-Metadata base64), PATCH request shape |
| Filename-to-base64 (Upload-Metadata) | Rust unit | UTF-8 filename round-trip; emoji + non-ASCII edge cases |
| `pipeline::should_upload` (the dedupe decision logic, extracted) | Rust unit | Skip-existing-path / skip-existing-sha / new-file paths |
| End-to-end upload | Manual smoke (Task 15-equivalent for B) | Drop file in folder → appears in vault |
| Network failure → retry | Manual smoke | Disable Wi-Fi, drop file, re-enable — confirm upload completes |
| Restart during queue | Manual smoke | Quit app with files queued → relaunch → confirm pickup via DB scan |

CI: `cargo test`, `cargo clippy -D warnings`, `cargo build --release` on Win + Mac. Unit + integration tests run; the manual end-to-end and network-failure tests are user-driven.

## Definition of done

A user can:

1. Update from v0.1.0 to v0.2.0 (rebuild + reinstall — no signed-update flow yet)
2. Click "Pick folder…" in the tray → native picker → select a folder
3. (If folder has existing files) Answer Yes/No to the "upload existing too?" prompt
4. See "Watching: <path>" in the tray
5. Drop a file (or 50 files) into the folder. They upload silently in the background.
6. View the uploaded files in `https://vault.bullmoosefn.com` → they appear in the user's home folder, auto-tagged with their username
7. Restart the app. No re-uploads occur (DB dedupe works). New files dropped while app was off get caught by the startup scan.
8. Pull the network cable mid-upload. App retries on backoff schedule. Reconnect → upload resumes (or restarts cleanly from offset 0 on a tus session that timed out — either is acceptable behavior).
9. Sign out → tray reverts to "Sign in"; pipeline pauses; queue preserved in memory.
10. Sign back in → pipeline resumes, queue drains.

That's the v0.2.0 release. Sub-project C adds toast notifications + the "view in vault" link from each toast.
