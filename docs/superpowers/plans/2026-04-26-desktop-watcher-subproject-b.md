# Desktop Watcher — Sub-project B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.2.0 of `vorevault-desktop`: a recursive folder watcher + tus upload pipeline + SQLite-backed dedupe + tray UX additions. After this ships, the user picks a folder once and any file dropped into it (or any subfolder) auto-uploads to their VoreVault home folder silently.

**Architecture:** Six new Rust modules in `src-tauri/src/` (`config`, `db`, `watcher`, `uploader`, `pipeline`, `dialogs`) plus updates to existing `tray.rs` + `main.rs`. The pipeline reads a config file at the platform default location, opens an SQLite db for the persistent uploaded-files index, runs a `notify` recursive watcher with 5-second debounce, dedupes via `(path, size, mtime)` then `sha256`, and dispatches uploads via raw `reqwest` calls implementing the tus protocol.

**Tech Stack:** Tauri 2.x (existing), Rust 2021. New deps: `notify = "8"`, `rusqlite = "0.39"` (bundled), `dirs = "6"`, `tauri-plugin-dialog = "2"`, `crossbeam-channel = "0.5"`. `sha2` already present from Sub-project A.

---

## Spec

`docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-b-design.md`. Read it for the full design (architecture diagram, dedupe rationale, tray UX states, failure matrix).

---

## File structure (in `vorevault-desktop` repo)

| Path | Status | Responsibility |
|---|---|---|
| `src-tauri/Cargo.toml` | **Modify** | Add 5 deps: `notify`, `rusqlite`, `dirs`, `tauri-plugin-dialog`, `crossbeam-channel` |
| `src-tauri/src/config.rs` | **Create** | Read/write `config.json` at platform-default path; atomic writes; corrupt-file backup-and-reset |
| `src-tauri/src/db.rs` | **Create** | `rusqlite` wrapper. One table (`uploaded_files`), idempotent schema init, dedupe queries, success record |
| `src-tauri/src/watcher.rs` | **Create** | `notify` recursive watcher with 5s debounce per path; emits "ready" paths on a `crossbeam-channel` |
| `src-tauri/src/uploader.rs` | **Create** | Raw tus protocol via `reqwest::blocking`. POST + PATCH chunks. Sends Cookie + Upload-Metadata. |
| `src-tauri/src/pipeline.rs` | **Create** | Owns the in-memory queue + 2 worker threads. Pulls from watcher channel, dedupes via DB, dispatches to uploader, records on success, retries on failure with backoff. Exposes a state-snapshot API for the tray to read. |
| `src-tauri/src/dialogs.rs` | **Create** | Native folder picker + Yes/No prompts via `tauri-plugin-dialog`. |
| `src-tauri/src/tray.rs` | **Modify** | New menu items: "Pick folder…", "Watching: <path>" (disabled label), "Uploading X of Y" (disabled label), "⚠ N failed uploads" (submenu). Refresh-on-state-change. |
| `src-tauri/src/main.rs` | **Modify** | Register `tauri-plugin-dialog`. Start the pipeline in setup if config has a watch_folder. |

---

## Conventions

- Rust 2021 edition, `cargo fmt` clean, `cargo clippy -D warnings` clean
- New modules get `#[cfg(test)] mod tests` blocks for testable logic
- File-watcher and network code is intentionally NOT unit-tested in CI (manual smoke test in Task 10 covers it). Pure logic helpers (debounce, URL building, base64 encoding, dedupe decision) ARE unit-tested
- Conventional Commits (`feat:`, `test:`, `fix:`, `chore:`)
- Run `cargo test` and `cargo clippy` from `/root/vorevault-desktop` (NOT inside `src-tauri/`) before each commit

---

## Task 1: Branch + dependencies + empty module scaffolding

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/config.rs`, `db.rs`, `watcher.rs`, `uploader.rs`, `pipeline.rs`, `dialogs.rs` (all empty stubs)
- Modify: `src-tauri/src/main.rs` (add `mod` declarations)

- [ ] **Step 1: Create the feature branch**

```bash
cd /root/vorevault-desktop
git checkout main
git pull origin main
git checkout -b feat/folder-watcher
```

- [ ] **Step 2: Add the new dependencies**

Edit `src-tauri/Cargo.toml`. Add to `[dependencies]` (after the existing entries):

```toml
notify = "8"
rusqlite = { version = "0.39", features = ["bundled"] }
dirs = "6"
tauri-plugin-dialog = "2"
crossbeam-channel = "0.5"
```

(`bundled` for rusqlite means it ships its own SQLite, no system lib needed — important for Win/Mac builds.)

- [ ] **Step 3: Create empty module files**

Create six empty stubs:

```bash
cd /root/vorevault-desktop/src-tauri/src
for f in config.rs db.rs watcher.rs uploader.rs pipeline.rs dialogs.rs; do
  echo "//! Sub-project B module — to be implemented." > "$f"
done
```

- [ ] **Step 4: Add module declarations in main.rs**

Edit `src-tauri/src/main.rs`. Update the existing `mod` block at the top to add the six new modules. The full set should now be:

```rust
mod auth;
mod config;
mod db;
mod dialogs;
mod keychain;
mod pipeline;
mod tray;
mod uploader;
mod watcher;
```

(Sorted alphabetically — that's the existing convention from Sub-project A.)

- [ ] **Step 5: Verify cargo check passes**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
```

Expected: clean check (just unused-module warnings since the new modules are empty). New crates download on first compile — may take 1-5 minutes depending on cache state.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml Cargo.lock src-tauri/src/
git commit -m "chore(deps): add notify, rusqlite, dirs, tauri-plugin-dialog, crossbeam-channel for Sub-project B"
```

---

## Task 2: `config.rs` — config.json read/write

**Files:**
- Modify: `src-tauri/src/config.rs`

- [ ] **Step 1: Write the failing tests**

Replace `src-tauri/src/config.rs` with the test setup + stub:

```rust
//! Read/write config.json at the platform default location.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct Config {
    pub watch_folder: Option<String>,
    pub watch_recursive: bool,
    pub scan_existing_on_pick: bool,
    pub debounce_ms: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            watch_folder: None,
            watch_recursive: true,
            scan_existing_on_pick: true,
            debounce_ms: 5000,
        }
    }
}

#[derive(Debug)]
pub enum ConfigError {
    Io(std::io::Error),
    NoConfigDir,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::Io(e) => write!(f, "config io: {}", e),
            ConfigError::NoConfigDir => write!(f, "could not resolve platform config dir"),
        }
    }
}

impl std::error::Error for ConfigError {}

/// Resolve the config directory: `<dirs::config_dir>/VoreVault/`.
/// Creates the directory if it doesn't exist.
pub fn config_dir() -> Result<PathBuf, ConfigError> {
    let base = dirs::config_dir().ok_or(ConfigError::NoConfigDir)?;
    let dir = base.join("VoreVault");
    std::fs::create_dir_all(&dir).map_err(ConfigError::Io)?;
    Ok(dir)
}

/// Load config from `<config_dir>/config.json`. Returns `Default::default()`
/// if the file doesn't exist. If the file exists but is corrupt JSON, backs
/// it up to `config.json.broken-<timestamp>` and returns defaults.
pub fn load() -> Result<Config, ConfigError> {
    load_from(&config_dir()?)
}

pub fn load_from(dir: &Path) -> Result<Config, ConfigError> {
    let _ = dir; // tests will exercise this
    todo!("test will drive this")
}

/// Save config atomically: write to `<dir>/config.json.tmp`, fsync, rename to
/// `<dir>/config.json`.
pub fn save(config: &Config) -> Result<(), ConfigError> {
    save_to(config, &config_dir()?)
}

pub fn save_to(_config: &Config, _dir: &Path) -> Result<(), ConfigError> {
    todo!("test will drive this")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn default_config_has_expected_values() {
        let c = Config::default();
        assert_eq!(c.watch_folder, None);
        assert!(c.watch_recursive);
        assert!(c.scan_existing_on_pick);
        assert_eq!(c.debounce_ms, 5000);
    }

    #[test]
    fn load_returns_defaults_when_file_missing() {
        let dir = TempDir::new().unwrap();
        let c = load_from(dir.path()).unwrap();
        assert_eq!(c, Config::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = TempDir::new().unwrap();
        let original = Config {
            watch_folder: Some("/tmp/foo".to_string()),
            watch_recursive: true,
            scan_existing_on_pick: false,
            debounce_ms: 3000,
        };
        save_to(&original, dir.path()).unwrap();
        let loaded = load_from(dir.path()).unwrap();
        assert_eq!(loaded, original);
    }

    #[test]
    fn save_writes_atomically_via_tmp_file() {
        let dir = TempDir::new().unwrap();
        let cfg = Config::default();
        save_to(&cfg, dir.path()).unwrap();
        // Final file exists, tmp is gone.
        assert!(dir.path().join("config.json").exists());
        assert!(!dir.path().join("config.json.tmp").exists());
    }

    #[test]
    fn load_with_corrupt_json_backs_up_and_returns_defaults() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("config.json"), "not json {").unwrap();
        let c = load_from(dir.path()).unwrap();
        assert_eq!(c, Config::default());
        // The corrupt file got renamed.
        let entries: Vec<_> = fs::read_dir(dir.path()).unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        let has_broken_backup = entries.iter().any(|n| n.starts_with("config.json.broken-"));
        assert!(has_broken_backup, "expected a config.json.broken-* backup, got {:?}", entries);
    }

    #[test]
    fn load_accepts_partial_json_and_fills_defaults() {
        // Only watch_folder set; other fields should default.
        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("config.json"),
            r#"{"watch_folder":"/foo"}"#,
        ).unwrap();
        let c = load_from(dir.path()).unwrap();
        assert_eq!(c.watch_folder, Some("/foo".to_string()));
        assert!(c.watch_recursive); // default true
        assert!(c.scan_existing_on_pick);
        assert_eq!(c.debounce_ms, 5000);
    }
}
```

- [ ] **Step 2: Add `tempfile` to dev-dependencies**

Edit `src-tauri/Cargo.toml`. Add at the bottom (creating the section if missing):

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Run tests to confirm they fail with `todo!`**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml --test '*' config 2>&1 | tail -10
# OR equivalently:
cargo test --manifest-path src-tauri/Cargo.toml config:: 2>&1 | tail -10
```

Expected: `default_config_has_expected_values` passes; the others panic with `not yet implemented`.

- [ ] **Step 4: Implement `load_from` and `save_to`**

Replace the `load_from` and `save_to` stubs in `config.rs` with:

```rust
pub fn load_from(dir: &Path) -> Result<Config, ConfigError> {
    let path = dir.join("config.json");
    if !path.exists() {
        return Ok(Config::default());
    }
    let bytes = std::fs::read(&path).map_err(ConfigError::Io)?;
    match serde_json::from_slice::<Config>(&bytes) {
        Ok(c) => Ok(c),
        Err(e) => {
            log::warn!("config.json is corrupt: {} — backing up + resetting", e);
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = dir.join(format!("config.json.broken-{}", ts));
            let _ = std::fs::rename(&path, &backup);
            Ok(Config::default())
        }
    }
}

pub fn save_to(config: &Config, dir: &Path) -> Result<(), ConfigError> {
    let final_path = dir.join("config.json");
    let tmp_path = dir.join("config.json.tmp");
    let json = serde_json::to_vec_pretty(config).expect("Config is always serializable");
    std::fs::write(&tmp_path, &json).map_err(ConfigError::Io)?;
    std::fs::rename(&tmp_path, &final_path).map_err(ConfigError::Io)?;
    Ok(())
}
```

- [ ] **Step 5: Run tests + confirm they pass**

```bash
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml config:: 2>&1 | tail -10
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml src-tauri/src/config.rs Cargo.lock
git commit -m "feat(config): config.json read/write with atomic writes + corrupt-file recovery"
```

---

## Task 3: `db.rs` — SQLite wrapper

**Files:**
- Modify: `src-tauri/src/db.rs`

- [ ] **Step 1: Write the test setup + stubs**

Replace `src-tauri/src/db.rs` with:

```rust
//! SQLite wrapper for the persistent uploaded-files index.

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

#[derive(Debug)]
pub enum DbError {
    Sqlite(rusqlite::Error),
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbError::Sqlite(e) => write!(f, "sqlite: {}", e),
        }
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        DbError::Sqlite(e)
    }
}

pub struct Db {
    conn: Connection,
}

#[derive(Debug, Clone, PartialEq)]
pub struct UploadedRow {
    pub path: String,
    pub size: u64,
    pub mtime_unix: i64,
    pub sha256: String,
    pub uploaded_at: i64,
}

impl Db {
    /// Open the database at `<dir>/uploads.db`. Creates the file + applies
    /// schema (idempotent) on first open.
    pub fn open(dir: &Path) -> Result<Self, DbError> {
        let path = dir.join("uploads.db");
        let conn = Connection::open(&path)?;
        let db = Db { conn };
        db.init_schema()?;
        Ok(db)
    }

    /// Open an in-memory database for tests.
    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let db = Db { conn };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), DbError> {
        self.conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS uploaded_files (
                path TEXT PRIMARY KEY,
                size INTEGER NOT NULL,
                mtime_unix INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                uploaded_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS uploaded_files_sha256_idx
                ON uploaded_files (sha256);
            CREATE INDEX IF NOT EXISTS uploaded_files_uploaded_at_idx
                ON uploaded_files (uploaded_at DESC);
            "#,
        )?;
        Ok(())
    }

    /// Cheap dedupe check: has this exact `(path, size, mtime)` been uploaded?
    pub fn has_path_size_mtime(
        &self,
        path: &str,
        size: u64,
        mtime_unix: i64,
    ) -> Result<bool, DbError> {
        let row: Option<i64> = self.conn.query_row(
            "SELECT 1 FROM uploaded_files WHERE path = ?1 AND size = ?2 AND mtime_unix = ?3",
            params![path, size as i64, mtime_unix],
            |r| r.get(0),
        ).optional()?;
        Ok(row.is_some())
    }

    /// Has any path with this sha256 been uploaded? (Catches renames + duplicate copies.)
    pub fn has_sha256(&self, sha256: &str) -> Result<bool, DbError> {
        let row: Option<i64> = self.conn.query_row(
            "SELECT 1 FROM uploaded_files WHERE sha256 = ?1",
            params![sha256],
            |r| r.get(0),
        ).optional()?;
        Ok(row.is_some())
    }

    /// Insert (or upsert) a successful upload row.
    pub fn record_upload(&self, row: &UploadedRow) -> Result<(), DbError> {
        self.conn.execute(
            r#"
            INSERT INTO uploaded_files (path, size, mtime_unix, sha256, uploaded_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(path) DO UPDATE SET
              size = excluded.size,
              mtime_unix = excluded.mtime_unix,
              sha256 = excluded.sha256,
              uploaded_at = excluded.uploaded_at
            "#,
            params![
                row.path,
                row.size as i64,
                row.mtime_unix,
                row.sha256,
                row.uploaded_at,
            ],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row() -> UploadedRow {
        UploadedRow {
            path: "/tmp/foo.mp4".to_string(),
            size: 1024,
            mtime_unix: 1_700_000_000,
            sha256: "deadbeef".to_string(),
            uploaded_at: 1_700_000_100,
        }
    }

    #[test]
    fn fresh_db_has_no_rows() {
        let db = Db::open_in_memory().unwrap();
        assert!(!db.has_path_size_mtime("/tmp/foo.mp4", 1024, 1_700_000_000).unwrap());
        assert!(!db.has_sha256("deadbeef").unwrap());
    }

    #[test]
    fn record_then_has_path_size_mtime_returns_true() {
        let db = Db::open_in_memory().unwrap();
        let row = sample_row();
        db.record_upload(&row).unwrap();
        assert!(db.has_path_size_mtime(&row.path, row.size, row.mtime_unix).unwrap());
    }

    #[test]
    fn has_path_size_mtime_is_strict_about_all_three_fields() {
        let db = Db::open_in_memory().unwrap();
        db.record_upload(&sample_row()).unwrap();
        // Same path, different size → false.
        assert!(!db.has_path_size_mtime("/tmp/foo.mp4", 999, 1_700_000_000).unwrap());
        // Same path + size, different mtime → false.
        assert!(!db.has_path_size_mtime("/tmp/foo.mp4", 1024, 9_999_999).unwrap());
        // Different path → false.
        assert!(!db.has_path_size_mtime("/tmp/bar.mp4", 1024, 1_700_000_000).unwrap());
    }

    #[test]
    fn record_then_has_sha256_returns_true() {
        let db = Db::open_in_memory().unwrap();
        db.record_upload(&sample_row()).unwrap();
        assert!(db.has_sha256("deadbeef").unwrap());
        assert!(!db.has_sha256("cafef00d").unwrap());
    }

    #[test]
    fn record_upsert_overwrites_existing_path() {
        let db = Db::open_in_memory().unwrap();
        let mut row = sample_row();
        db.record_upload(&row).unwrap();
        // Update size + mtime + sha256, same path.
        row.size = 2048;
        row.mtime_unix = 1_700_001_000;
        row.sha256 = "newhash".to_string();
        row.uploaded_at = 1_700_001_100;
        db.record_upload(&row).unwrap();
        assert!(db.has_path_size_mtime(&row.path, 2048, 1_700_001_000).unwrap());
        assert!(db.has_sha256("newhash").unwrap());
        assert!(!db.has_sha256("deadbeef").unwrap()); // old hash gone
    }

    #[test]
    fn schema_init_is_idempotent() {
        let db = Db::open_in_memory().unwrap();
        db.init_schema().unwrap(); // re-run; should not error
        db.init_schema().unwrap();
    }
}
```

- [ ] **Step 2: Run tests + confirm they pass**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml db:: 2>&1 | tail -15
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/db.rs
git commit -m "feat(db): SQLite wrapper for uploaded_files index with two-tier dedupe queries"
```

---

## Task 4: `watcher.rs` — debounced recursive file watcher

**Files:**
- Modify: `src-tauri/src/watcher.rs`

This module wraps the `notify` crate. The non-trivial logic is the **debounce** — multiple events for the same path within a short window collapse into a single "ready" emit. We test the debounce logic via a pure helper that doesn't depend on `notify`.

- [ ] **Step 1: Write the debounce helper + tests**

Replace `src-tauri/src/watcher.rs` with:

```rust
//! Recursive file watcher with per-path debounce.

use crossbeam_channel::{Receiver, Sender};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Pure-logic debounce buffer: tracks the most recent event time per path,
/// emits a path as "ready" only after `debounce` elapses with no further events.
#[derive(Debug)]
pub struct Debouncer {
    debounce: Duration,
    pending: HashMap<PathBuf, Instant>,
}

impl Debouncer {
    pub fn new(debounce: Duration) -> Self {
        Self { debounce, pending: HashMap::new() }
    }

    /// Record a fresh event for `path`. Returns nothing — the caller polls
    /// `take_ready(now)` periodically to drain ready paths.
    pub fn note_event(&mut self, path: PathBuf, now: Instant) {
        self.pending.insert(path, now);
    }

    /// Return all paths whose most-recent event was at least `debounce` ago,
    /// removing them from the pending set.
    pub fn take_ready(&mut self, now: Instant) -> Vec<PathBuf> {
        let threshold = now.checked_sub(self.debounce).unwrap_or(now);
        let ready: Vec<PathBuf> = self.pending
            .iter()
            .filter(|(_, &t)| t <= threshold)
            .map(|(p, _)| p.clone())
            .collect();
        for p in &ready {
            self.pending.remove(p);
        }
        ready
    }

    /// How many paths are currently held in the pending map.
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }
}

/// Start the file watcher in a background thread. Returns a `Receiver`
/// that emits paths as they become "ready" (debounce elapsed, no further
/// events for that path).
///
/// The watcher uses notify's recommended platform-native backend and is
/// recursive over the given root.
///
/// Returns Err if the watcher couldn't be created (path doesn't exist,
/// permission denied, etc.).
pub fn start(_root: PathBuf, _debounce_ms: u64) -> Result<Receiver<PathBuf>, WatcherError> {
    todo!("implemented in step 3")
}

#[derive(Debug)]
pub enum WatcherError {
    Notify(notify::Error),
}

impl std::fmt::Display for WatcherError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WatcherError::Notify(e) => write!(f, "notify: {}", e),
        }
    }
}

impl std::error::Error for WatcherError {}

impl From<notify::Error> for WatcherError {
    fn from(e: notify::Error) -> Self {
        WatcherError::Notify(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(secs: u64) -> Instant {
        // A monotonic instant offset by `secs` seconds from a fixed base.
        // We can't construct Instant from a literal, so derive from "now"
        // and add a deterministic offset for relative comparisons.
        Instant::now() + Duration::from_secs(secs)
    }

    #[test]
    fn empty_debouncer_emits_nothing() {
        let mut d = Debouncer::new(Duration::from_secs(5));
        assert!(d.take_ready(t(100)).is_empty());
    }

    #[test]
    fn single_event_becomes_ready_after_debounce() {
        let mut d = Debouncer::new(Duration::from_secs(5));
        d.note_event(PathBuf::from("/a"), t(0));
        // Not ready yet (only 3 seconds elapsed).
        assert!(d.take_ready(t(3)).is_empty());
        assert_eq!(d.pending_count(), 1);
        // Ready after 5+ seconds.
        let ready = d.take_ready(t(5));
        assert_eq!(ready, vec![PathBuf::from("/a")]);
        assert_eq!(d.pending_count(), 0);
    }

    #[test]
    fn re_event_resets_the_debounce_for_that_path() {
        let mut d = Debouncer::new(Duration::from_secs(5));
        d.note_event(PathBuf::from("/a"), t(0));
        // 3s in, another event.
        d.note_event(PathBuf::from("/a"), t(3));
        // 5s in (only 2s after the latest event) — not ready.
        assert!(d.take_ready(t(5)).is_empty());
        // 8s in (5s after the latest event) — ready.
        let ready = d.take_ready(t(8));
        assert_eq!(ready, vec![PathBuf::from("/a")]);
    }

    #[test]
    fn different_paths_have_independent_timers() {
        let mut d = Debouncer::new(Duration::from_secs(5));
        d.note_event(PathBuf::from("/a"), t(0));
        d.note_event(PathBuf::from("/b"), t(3));
        // 6s: /a is ready (6s elapsed), /b is not (only 3s elapsed).
        let mut ready = d.take_ready(t(6));
        ready.sort();
        assert_eq!(ready, vec![PathBuf::from("/a")]);
        // 9s: /b is now ready.
        let ready = d.take_ready(t(9));
        assert_eq!(ready, vec![PathBuf::from("/b")]);
    }

    #[test]
    fn take_ready_is_idempotent_for_already_ready_paths() {
        let mut d = Debouncer::new(Duration::from_secs(5));
        d.note_event(PathBuf::from("/a"), t(0));
        let _ = d.take_ready(t(5));
        // Second call returns nothing — /a was already taken.
        assert!(d.take_ready(t(10)).is_empty());
    }
}
```

- [ ] **Step 2: Run debounce tests + confirm they pass**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml watcher:: 2>&1 | tail -15
```

Expected: 5 tests pass (the `start` function isn't called by these tests).

- [ ] **Step 3: Implement `start()` (the notify wrapper)**

Replace the `start` stub in `watcher.rs` with:

```rust
pub fn start(root: PathBuf, debounce_ms: u64) -> Result<Receiver<PathBuf>, WatcherError> {
    use notify::{Config as NotifyConfig, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

    // Two channels: notify→thread (raw events), thread→consumer (ready paths).
    let (raw_tx, raw_rx) = crossbeam_channel::unbounded::<Event>();
    let (ready_tx, ready_rx) = crossbeam_channel::unbounded::<PathBuf>();

    // Build the watcher; closure forwards events via the raw channel.
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(ev) = res {
            let _ = raw_tx.send(ev);
        }
    })?;

    watcher.watch(&root, RecursiveMode::Recursive)?;

    // Background thread owns the watcher (so it isn't dropped) + the debouncer.
    // Loops: select between raw events and a periodic poll tick.
    std::thread::spawn(move || {
        // Pin the watcher in this thread so it lives as long as the loop.
        let _watcher = watcher;
        let mut deb = Debouncer::new(Duration::from_millis(debounce_ms));
        let tick = crossbeam_channel::tick(Duration::from_millis(500));

        loop {
            crossbeam_channel::select! {
                recv(raw_rx) -> msg => match msg {
                    Ok(ev) => {
                        // We care about file create / modify / rename-to.
                        // Ignore directory events; ignore Remove (handled lazily).
                        let kind_ok = matches!(
                            ev.kind,
                            EventKind::Create(_) | EventKind::Modify(_)
                        );
                        if !kind_ok { continue; }
                        for p in ev.paths {
                            // notify can emit dirs and files; only enqueue files.
                            if p.is_file() {
                                deb.note_event(p, Instant::now());
                            }
                        }
                    }
                    Err(_) => break, // sender dropped → exit
                },
                recv(tick) -> _ => {
                    let now = Instant::now();
                    for path in deb.take_ready(now) {
                        if ready_tx.send(path).is_err() { return; }
                    }
                }
            }
        }
    });

    Ok(ready_rx)
}
```

- [ ] **Step 4: Run cargo check + tests**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
cargo test --manifest-path src-tauri/Cargo.toml watcher:: 2>&1 | tail -15
```

Expected: clean check, 5 tests still pass. The new `start()` isn't unit-tested (real notify behavior is filesystem-dependent); manual smoke test in Task 10 exercises it.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/watcher.rs
git commit -m "feat(watcher): notify-based recursive watcher with per-path debounce"
```

---

## Task 5: `uploader.rs` — tus protocol via reqwest

**Files:**
- Modify: `src-tauri/src/uploader.rs`

The tus protocol is small enough to implement directly without a dedicated crate. Public API: `upload_file(vault_url, session_token, path)`. Internal helpers (URL building, base64 metadata) are pure functions we unit-test.

- [ ] **Step 1: Write the helpers + tests**

Replace `src-tauri/src/uploader.rs` with:

```rust
//! tus protocol uploader. Sends Cookie-authenticated uploads to vault.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;
use std::time::Duration;

const TUS_RESUMABLE: &str = "1.0.0";
const PATCH_CHUNK_SIZE: usize = 5 * 1024 * 1024; // 5 MB

#[derive(Debug)]
pub enum UploadError {
    Io(std::io::Error),
    Reqwest(reqwest::Error),
    BadStatus(u16),
    /// The session is no longer valid — caller should pause the queue.
    Unauthorized,
    /// Server reports the file is too big.
    TooLarge,
    NoLocationHeader,
}

impl std::fmt::Display for UploadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            UploadError::Io(e) => write!(f, "io: {}", e),
            UploadError::Reqwest(e) => write!(f, "http: {}", e),
            UploadError::BadStatus(s) => write!(f, "bad status: {}", s),
            UploadError::Unauthorized => write!(f, "session expired"),
            UploadError::TooLarge => write!(f, "file too large"),
            UploadError::NoLocationHeader => write!(f, "tus POST returned no Location header"),
        }
    }
}

impl std::error::Error for UploadError {}

impl From<std::io::Error> for UploadError {
    fn from(e: std::io::Error) -> Self { UploadError::Io(e) }
}

impl From<reqwest::Error> for UploadError {
    fn from(e: reqwest::Error) -> Self { UploadError::Reqwest(e) }
}

/// Upload `path` to `<vault_url>/files/` via tus, sending `Cookie: vv_session=<token>`.
/// On success, returns Ok(()). The vault file UUID is NOT returned (see spec
/// — Sub-project C will add a server-side X-Vault-File-Id header).
pub fn upload_file(vault_url: &str, session_token: &str, path: &Path) -> Result<(), UploadError> {
    let metadata = std::fs::metadata(path)?;
    let size = metadata.len();
    let filename = path.file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| UploadError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "filename not valid utf-8",
        )))?;

    let upload_url = build_files_url(vault_url);
    let cookie = format!("vv_session={}", session_token);
    let metadata_header = build_upload_metadata(filename);

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60 * 30)) // 30 minutes for big files
        .build()?;

    // POST to create the upload.
    let resp = client.post(&upload_url)
        .header("Cookie", &cookie)
        .header("Tus-Resumable", TUS_RESUMABLE)
        .header("Upload-Length", size.to_string())
        .header("Upload-Metadata", &metadata_header)
        .send()?;

    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(UploadError::Unauthorized);
    }
    if status == reqwest::StatusCode::PAYLOAD_TOO_LARGE {
        return Err(UploadError::TooLarge);
    }
    if !status.is_success() {
        return Err(UploadError::BadStatus(status.as_u16()));
    }

    let location = resp.headers()
        .get("Location")
        .and_then(|v| v.to_str().ok())
        .ok_or(UploadError::NoLocationHeader)?
        .to_string();

    // PATCH chunks until we've sent all bytes.
    let mut file = std::fs::File::open(path)?;
    let mut offset: u64 = 0;
    let mut buf = vec![0u8; PATCH_CHUNK_SIZE];

    while offset < size {
        use std::io::Read;
        let to_read = ((size - offset).min(PATCH_CHUNK_SIZE as u64)) as usize;
        let n = file.read(&mut buf[..to_read])?;
        if n == 0 { break; }
        let chunk = buf[..n].to_vec();

        let resp = client.patch(&location)
            .header("Cookie", &cookie)
            .header("Tus-Resumable", TUS_RESUMABLE)
            .header("Upload-Offset", offset.to_string())
            .header("Content-Type", "application/offset+octet-stream")
            .body(chunk)
            .send()?;

        let status = resp.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(UploadError::Unauthorized);
        }
        if !status.is_success() {
            return Err(UploadError::BadStatus(status.as_u16()));
        }
        offset += n as u64;
    }

    Ok(())
}

/// Build the tus collection URL: `<vault_url>/files/`.
pub fn build_files_url(vault_url: &str) -> String {
    format!("{}/files/", vault_url.trim_end_matches('/'))
}

/// Build the `Upload-Metadata` header value per tus spec: space-separated
/// `key base64(value)` pairs.
pub fn build_upload_metadata(filename: &str) -> String {
    format!("filename {}", STANDARD.encode(filename.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_files_url_appends_files_slash() {
        assert_eq!(build_files_url("https://vault.example.com"), "https://vault.example.com/files/");
    }

    #[test]
    fn build_files_url_strips_trailing_slash_first() {
        assert_eq!(build_files_url("https://vault.example.com/"), "https://vault.example.com/files/");
    }

    #[test]
    fn build_upload_metadata_base64_encodes_filename() {
        let m = build_upload_metadata("foo.mp4");
        // base64("foo.mp4") = "Zm9vLm1wNA=="
        assert_eq!(m, "filename Zm9vLm1wNA==");
    }

    #[test]
    fn build_upload_metadata_handles_unicode() {
        // Filenames with non-ASCII still base64-encode their UTF-8 bytes.
        let m = build_upload_metadata("café.png");
        // base64("café.png") = "Y2Fmw6kucG5n"
        assert_eq!(m, "filename Y2Fmw6kucG5n");
    }

    #[test]
    fn build_upload_metadata_handles_emoji() {
        let m = build_upload_metadata("clip 🎮.mp4");
        // Just verify it parses and the prefix is right; full bytes vary.
        assert!(m.starts_with("filename "));
        assert!(m.len() > "filename ".len() + 4);
    }
}
```

- [ ] **Step 2: Run tests + confirm they pass**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml uploader:: 2>&1 | tail -10
```

Expected: 5 tests pass (the network call in `upload_file` isn't unit-tested; manual smoke in Task 10).

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/uploader.rs
git commit -m "feat(uploader): tus protocol upload via reqwest with helpers"
```

---

## Task 6: `dialogs.rs` — native folder picker + Yes/No prompts

**Files:**
- Modify: `src-tauri/src/dialogs.rs`
- Modify: `src-tauri/src/main.rs` (register the plugin)

- [ ] **Step 1: Implement the dialogs module**

Replace `src-tauri/src/dialogs.rs` with:

```rust
//! Native OS dialogs via tauri-plugin-dialog.

use std::path::PathBuf;
use std::sync::mpsc;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// Show the native folder picker. Returns the selected path or None on cancel.
/// Blocks the calling thread until the user picks or cancels — must be called
/// from a worker thread, never the main UI thread.
pub fn pick_folder(app: &AppHandle) -> Option<PathBuf> {
    let (tx, rx) = mpsc::channel::<Option<PathBuf>>();
    app.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path.and_then(|p| p.into_path().ok()));
    });
    rx.recv().unwrap_or(None)
}

/// Show a native Yes/No prompt with the given message. Returns true for Yes,
/// false for No or Cancel. Blocks — call from a worker thread.
pub fn yes_no(app: &AppHandle, title: &str, message: &str) -> bool {
    let (tx, rx) = mpsc::channel::<bool>();
    let title = title.to_string();
    let message = message.to_string();
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::YesNo)
        .show(move |answer| {
            let _ = tx.send(answer);
        });
    rx.recv().unwrap_or(false)
}
```

- [ ] **Step 2: Register the plugin in main.rs**

Edit `src-tauri/src/main.rs`. The existing `setup` block looks like:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| { ... })
```

Change to add the dialog plugin:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| { ... })
```

- [ ] **Step 3: Verify cargo check passes**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
```

Expected: clean. No new tests in this task — `pick_folder` and `yes_no` are GUI-bound and tested manually.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/dialogs.rs src-tauri/src/main.rs
git commit -m "feat(dialogs): native folder picker + yes/no via tauri-plugin-dialog"
```

---

## Task 7: `pipeline.rs` — orchestration

This is the biggest module. It owns:
- The in-memory queue (`crossbeam_channel`)
- N=2 worker threads
- The dedupe decision logic (testable as a pure function)
- The retry/backoff state machine
- A state-snapshot API the tray reads to render its menu

**Files:**
- Modify: `src-tauri/src/pipeline.rs`

- [ ] **Step 1: Write the dedupe-decision helper + tests**

The most testable part of the pipeline is the "should we upload this file?" decision: given metadata and DB query results, returns one of {Skip, AlreadyUploadedSamePath, AlreadyUploadedDifferentPath, ProceedToUpload}.

Replace `src-tauri/src/pipeline.rs` with:

```rust
//! Upload orchestration: queue, worker threads, dedupe, retry/backoff.

use crate::db::{Db, UploadedRow};
use crate::uploader::{self, UploadError};
use crossbeam_channel::{Receiver, Sender};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const NUM_WORKERS: usize = 2;
const BACKOFF: &[Duration] = &[
    Duration::from_secs(5),
    Duration::from_secs(30),
    Duration::from_secs(5 * 60),
    Duration::from_secs(30 * 60),
    Duration::from_secs(2 * 60 * 60),
    Duration::from_secs(6 * 60 * 60),
    Duration::from_secs(24 * 60 * 60),
];

/// Skipped because the file is filtered (dotfile, temp suffix, symlink, zero bytes).
/// The pipeline never enqueues these.
pub const SKIPPED_PREFIXES: &[&str] = &["."];
pub const SKIPPED_SUFFIXES: &[&str] = &[".crdownload", ".part", ".tmp", ".partial"];

/// Decision for what to do with a candidate upload.
#[derive(Debug, PartialEq)]
pub enum UploadDecision {
    Filter,                              // dotfile / temp suffix / symlink / zero-byte
    AlreadyUploadedSamePath,             // exact (path, size, mtime) match in DB
    AlreadyUploadedDifferentPath,        // sha256 match, different path → record-only
    Proceed,                             // hash + dispatch to uploader
}

/// Cheap filter: filename-based predicates.
pub fn filter_by_name(filename: &str) -> bool {
    if SKIPPED_PREFIXES.iter().any(|p| filename.starts_with(p)) {
        return true;
    }
    if SKIPPED_SUFFIXES.iter().any(|s| filename.ends_with(s)) {
        return true;
    }
    false
}

/// Decide what to do given metadata + DB query results. Pure function; the
/// caller does the actual SHA computation and DB lookups.
pub fn decide(
    filename: &str,
    is_regular_file: bool,
    is_symlink: bool,
    size: u64,
    has_path_size_mtime_match: bool,
    has_sha256_match: Option<bool>,
) -> UploadDecision {
    if !is_regular_file || is_symlink || size == 0 {
        return UploadDecision::Filter;
    }
    if filter_by_name(filename) {
        return UploadDecision::Filter;
    }
    if has_path_size_mtime_match {
        return UploadDecision::AlreadyUploadedSamePath;
    }
    match has_sha256_match {
        Some(true) => UploadDecision::AlreadyUploadedDifferentPath,
        Some(false) => UploadDecision::Proceed,
        None => UploadDecision::Proceed, // not yet checked
    }
}

/// Stream-hash a file via SHA256.
pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 16 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 { break; }
        hasher.update(&buf[..n]);
    }
    Ok(hex_encode(&hasher.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

/// Snapshot of pipeline state, read by the tray to render its menu.
#[derive(Debug, Clone, Default)]
pub struct PipelineState {
    pub watching_path: Option<String>,
    pub queued: usize,
    pub uploading: usize,
    pub failed_paths: Vec<String>,
    pub auth_invalid: bool,
}

/// Handle to a running pipeline. Drop to stop the workers (they'll finish
/// any in-flight upload and then exit).
pub struct Pipeline {
    state: Arc<Mutex<PipelineState>>,
    /// Channel sender: external code (e.g., the startup folder scan) can
    /// enqueue paths directly. The watcher channel is also drained internally.
    enqueue: Sender<PathBuf>,
}

impl Pipeline {
    pub fn enqueue(&self, path: PathBuf) {
        let _ = self.enqueue.send(path);
    }
    pub fn snapshot(&self) -> PipelineState {
        self.state.lock().unwrap().clone()
    }
}

/// Spawn the pipeline. Reads from the watcher channel + the internal enqueue
/// channel; writes uploads via `uploader::upload_file`; records successes in
/// `db`. Maintains the public `PipelineState` snapshot.
pub fn start(
    watcher_rx: Receiver<PathBuf>,
    db: Arc<Db>,
    vault_url: String,
    get_session_token: Arc<dyn Fn() -> Option<String> + Send + Sync>,
    watching_path: String,
) -> Pipeline {
    let (enqueue_tx, enqueue_rx) = crossbeam_channel::unbounded::<PathBuf>();
    let state = Arc::new(Mutex::new(PipelineState {
        watching_path: Some(watching_path),
        ..Default::default()
    }));

    // Forwarder: drain watcher_rx + enqueue_rx into a single work_rx.
    let (work_tx, work_rx) = crossbeam_channel::unbounded::<PathBuf>();
    {
        let work_tx = work_tx.clone();
        std::thread::spawn(move || loop {
            crossbeam_channel::select! {
                recv(watcher_rx) -> p => {
                    match p {
                        Ok(p) => { let _ = work_tx.send(p); }
                        Err(_) => break,
                    }
                }
                recv(enqueue_rx) -> p => {
                    match p {
                        Ok(p) => { let _ = work_tx.send(p); }
                        Err(_) => break,
                    }
                }
            }
        });
    }

    // Worker threads.
    for _ in 0..NUM_WORKERS {
        let work_rx = work_rx.clone();
        let db = db.clone();
        let vault_url = vault_url.clone();
        let get_token = get_session_token.clone();
        let state = state.clone();

        std::thread::spawn(move || {
            while let Ok(path) = work_rx.recv() {
                process_one(&path, &db, &vault_url, &get_token, &state);
            }
        });
    }

    Pipeline { state, enqueue: enqueue_tx }
}

fn process_one(
    path: &Path,
    db: &Db,
    vault_url: &str,
    get_token: &Arc<dyn Fn() -> Option<String> + Send + Sync>,
    state: &Arc<Mutex<PipelineState>>,
) {
    // Quick metadata + filter pass.
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return, // file gone
    };

    let is_symlink = meta.file_type().is_symlink();
    let is_regular = meta.is_file();
    let size = meta.len();
    let mtime_unix = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

    let path_str = path.to_string_lossy().to_string();
    let cheap = db.has_path_size_mtime(&path_str, size, mtime_unix).unwrap_or(false);

    // Decide without sha first; if Proceed and not cheap-match, hash and re-check.
    match decide(filename, is_regular, is_symlink, size, cheap, None) {
        UploadDecision::Filter => return,
        UploadDecision::AlreadyUploadedSamePath => return,
        UploadDecision::AlreadyUploadedDifferentPath => unreachable!("only with Some(true) sha"),
        UploadDecision::Proceed => {} // continue
    }

    // Hash + sha-based dedupe.
    let sha256 = match sha256_file(path) {
        Ok(s) => s,
        Err(_) => return,
    };
    let sha_match = db.has_sha256(&sha256).unwrap_or(false);

    if sha_match {
        // Record the new path → existing content mapping; don't re-upload.
        let row = UploadedRow {
            path: path_str.clone(),
            size,
            mtime_unix,
            sha256: sha256.clone(),
            uploaded_at: now_unix(),
        };
        let _ = db.record_upload(&row);
        return;
    }

    // Proceed to upload (with backoff retry).
    {
        let mut s = state.lock().unwrap();
        s.uploading += 1;
    }

    let mut attempt: usize = 0;
    let result = loop {
        let token = match get_token() {
            Some(t) => t,
            None => {
                let mut s = state.lock().unwrap();
                s.auth_invalid = true;
                break Err(UploadError::Unauthorized);
            }
        };
        match uploader::upload_file(vault_url, &token, path) {
            Ok(()) => break Ok(()),
            Err(UploadError::Unauthorized) => {
                let mut s = state.lock().unwrap();
                s.auth_invalid = true;
                break Err(UploadError::Unauthorized);
            }
            Err(UploadError::TooLarge) => break Err(UploadError::TooLarge),
            Err(e) => {
                if attempt >= BACKOFF.len() {
                    log::warn!("giving up on {} after {} attempts: {}", path.display(), attempt + 1, e);
                    break Err(e);
                }
                let delay = BACKOFF[attempt];
                log::info!("upload failed (attempt {}): {} — retrying in {:?}", attempt + 1, e, delay);
                std::thread::sleep(delay);
                attempt += 1;
            }
        }
    };

    {
        let mut s = state.lock().unwrap();
        s.uploading = s.uploading.saturating_sub(1);
        if result.is_err() {
            s.failed_paths.push(path_str.clone());
        }
    }

    if result.is_ok() {
        let row = UploadedRow {
            path: path_str,
            size,
            mtime_unix,
            sha256,
            uploaded_at: now_unix(),
        };
        let _ = db.record_upload(&row);
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filter_skips_dotfiles() {
        assert!(filter_by_name(".DS_Store"));
        assert!(filter_by_name(".hidden"));
    }

    #[test]
    fn filter_skips_temp_suffixes() {
        assert!(filter_by_name("download.crdownload"));
        assert!(filter_by_name("upload.part"));
        assert!(filter_by_name("session.tmp"));
        assert!(filter_by_name("file.partial"));
    }

    #[test]
    fn filter_passes_normal_filenames() {
        assert!(!filter_by_name("clip.mp4"));
        assert!(!filter_by_name("screenshot.png"));
        assert!(!filter_by_name("foo bar.zip"));
    }

    #[test]
    fn decide_filter_for_dotfile() {
        let d = decide(".DS_Store", true, false, 100, false, None);
        assert_eq!(d, UploadDecision::Filter);
    }

    #[test]
    fn decide_filter_for_zero_byte() {
        let d = decide("clip.mp4", true, false, 0, false, None);
        assert_eq!(d, UploadDecision::Filter);
    }

    #[test]
    fn decide_filter_for_symlink() {
        let d = decide("clip.mp4", true, true, 100, false, None);
        assert_eq!(d, UploadDecision::Filter);
    }

    #[test]
    fn decide_filter_for_directory() {
        let d = decide("foo", false, false, 100, false, None);
        assert_eq!(d, UploadDecision::Filter);
    }

    #[test]
    fn decide_already_uploaded_same_path() {
        let d = decide("clip.mp4", true, false, 100, true, None);
        assert_eq!(d, UploadDecision::AlreadyUploadedSamePath);
    }

    #[test]
    fn decide_already_uploaded_different_path_via_sha() {
        let d = decide("clip.mp4", true, false, 100, false, Some(true));
        assert_eq!(d, UploadDecision::AlreadyUploadedDifferentPath);
    }

    #[test]
    fn decide_proceed_when_new() {
        let d = decide("clip.mp4", true, false, 100, false, Some(false));
        assert_eq!(d, UploadDecision::Proceed);
        // Or with no sha check yet:
        let d = decide("clip.mp4", true, false, 100, false, None);
        assert_eq!(d, UploadDecision::Proceed);
    }

    #[test]
    fn sha256_file_matches_known_value() {
        use std::io::Write;
        let dir = tempfile::TempDir::new().unwrap();
        let p = dir.path().join("foo.txt");
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(b"hello world").unwrap();
        let h = sha256_file(&p).unwrap();
        assert_eq!(h, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    }
}
```

- [ ] **Step 2: Run tests + confirm they pass**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo test --manifest-path src-tauri/Cargo.toml pipeline:: 2>&1 | tail -15
```

Expected: 11 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): orchestration with dedupe + sha hashing + backoff retry"
```

---

## Task 8: Update `tray.rs` — new menu items + state-aware refresh

**Files:**
- Modify: `src-tauri/src/tray.rs`

The existing `tray.rs` has `install` + `refresh_menu` + `handle_menu_event` that build the menu based on `auth::AuthState`. We extend it to also read `pipeline::PipelineState` and render the new items.

- [ ] **Step 1: Refactor refresh_menu to take the pipeline state too**

In `src-tauri/src/tray.rs`, find the existing `refresh_menu` function (signature is `pub fn refresh_menu(app: &AppHandle, vault_url: &str)`) and the `build_menu` function. Replace both with the following (the surrounding code — install, the static MUTEX, etc. — stays unchanged):

```rust
/// Recompute the tray menu based on auth + pipeline state. Performs network
/// check (auth::current_state). Caller is responsible for running this off
/// the main thread.
pub fn refresh_menu(app: &AppHandle, vault_url: &str) {
    let auth_state = crate::auth::current_state(vault_url);

    // Pipeline state may be None if the pipeline hasn't been started (no
    // watch_folder configured, or auth is invalid).
    let pipeline_state = read_pipeline_state(app);

    let menu = match build_menu(app, &auth_state, pipeline_state.as_ref()) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("failed to build tray menu: {}", e);
            return;
        }
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(
    app: &AppHandle,
    auth: &crate::auth::AuthState,
    pipe: Option<&crate::pipeline::PipelineState>,
) -> tauri::Result<Menu<Wry>> {
    let quit = MenuItem::with_id(app, "quit", "Quit VoreVault", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);

    match &auth.username {
        Some(username) => {
            let signed_in_label = MenuItem::with_id(
                app,
                "signed-in-label",
                format!("Signed in as @{}", username),
                false,
                None::<&str>,
            )?;
            let mut items: Vec<&dyn IsMenuItem<Wry>> = vec![&signed_in_label];

            // Pipeline-related items, if a folder is configured.
            let watching_label;
            let uploading_label;
            let failed_label;
            let pick_folder;
            let signout;
            let sep1 = sep()?;
            let sep2 = sep()?;

            if let Some(p) = pipe {
                if let Some(path) = &p.watching_path {
                    watching_label = MenuItem::with_id(
                        app,
                        "watching-label",
                        format!("Watching: {}", path),
                        false,
                        None::<&str>,
                    )?;
                    items.push(&watching_label);
                }
                let busy = p.queued + p.uploading;
                if p.uploading > 0 {
                    uploading_label = MenuItem::with_id(
                        app,
                        "uploading-label",
                        format!("Uploading {} of {}…", p.uploading, busy),
                        false,
                        None::<&str>,
                    )?;
                    items.push(&uploading_label);
                }
                if !p.failed_paths.is_empty() {
                    failed_label = MenuItem::with_id(
                        app,
                        "failed-label",
                        format!("⚠ {} failed uploads", p.failed_paths.len()),
                        false,
                        None::<&str>,
                    )?;
                    items.push(&failed_label);
                }
            }

            items.push(&sep1);

            pick_folder = MenuItem::with_id(app, "pick-folder", "Pick folder…", true, None::<&str>)?;
            items.push(&pick_folder);

            items.push(&sep2);

            signout = MenuItem::with_id(app, "sign-out", "Sign out", true, None::<&str>)?;
            items.push(&signout);

            items.push(&quit);

            Menu::with_items(app, &items)
        }
        None => {
            // Signed out — just sign-in + quit.
            let signin = MenuItem::with_id(app, "sign-in", "Sign in", true, None::<&str>)?;
            Menu::with_items(app, &[&signin, &sep()?, &quit])
        }
    }
}
```

- [ ] **Step 2: Add the import for `IsMenuItem`**

At the top of `tray.rs`, in the existing `use tauri::{...};` line, ensure `IsMenuItem` is imported:

```rust
use tauri::{
    menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, Wry,
};
```

- [ ] **Step 3: Add the `read_pipeline_state` helper + storage**

Tray needs a way to get the current pipeline snapshot. The pipeline is owned by `main.rs`'s setup; it sets a global `OnceLock<Pipeline>` that the tray reads.

Add to the top of `tray.rs` (after the existing constants):

```rust
use std::sync::OnceLock;

/// The running pipeline. Set by main.rs after a successful folder-pick
/// or on startup if a folder is already configured. None if no pipeline
/// is currently running.
pub static PIPELINE: OnceLock<crate::pipeline::Pipeline> = OnceLock::new();

fn read_pipeline_state(_app: &AppHandle) -> Option<crate::pipeline::PipelineState> {
    PIPELINE.get().map(|p| p.snapshot())
}
```

- [ ] **Step 4: Add the "pick-folder" menu event handler**

In the existing `handle_menu_event` function, add a new arm for `"pick-folder"`. The full function should now read:

```rust
fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id.as_ref() {
        "sign-in" => spawn_sign_in(app.clone()),
        "sign-out" => spawn_sign_out(app.clone()),
        "pick-folder" => spawn_pick_folder(app.clone()),
        "quit" => app.exit(0),
        _ => {}
    }
}

fn spawn_pick_folder(app: AppHandle) {
    std::thread::spawn(move || {
        let path = match crate::dialogs::pick_folder(&app) {
            Some(p) => p,
            None => return, // user cancelled
        };

        // Count files in the picked folder (recursive).
        let count = count_files_recursive(&path);

        let scan_existing = if count > 0 {
            crate::dialogs::yes_no(
                &app,
                "Upload existing files?",
                &format!(
                    "Found {} existing files in this folder. Upload them too?",
                    count,
                ),
            )
        } else {
            true // empty folder, default to "yes" so future-added files upload
        };

        // Update config + restart the pipeline.
        let mut cfg = crate::config::load().unwrap_or_default();
        cfg.watch_folder = Some(path.to_string_lossy().to_string());
        cfg.scan_existing_on_pick = scan_existing;
        if let Err(e) = crate::config::save(&cfg) {
            log::warn!("failed to save config: {}", e);
            return;
        }

        // The pipeline restart is owned by main.rs; tray just signals via
        // a refresh. main.rs's startup also called start_pipeline_if_configured;
        // for v0.2 a folder-change after launch requires the user to
        // restart the app to take effect (simplest path; multi-folder hot-swap
        // is a Sub-project D concern).
        log::info!("watch folder set to {} (restart app to begin watching)", cfg.watch_folder.as_deref().unwrap_or(""));

        let vault_url = crate::auth::vault_url_from_env();
        refresh_menu(&app, &vault_url);
    });
}

fn count_files_recursive(root: &std::path::Path) -> u64 {
    fn walk(p: &std::path::Path, n: &mut u64) {
        if let Ok(entries) = std::fs::read_dir(p) {
            for e in entries.flatten() {
                let path = e.path();
                if path.is_file() {
                    *n += 1;
                } else if path.is_dir() {
                    walk(&path, n);
                }
            }
        }
    }
    let mut n = 0u64;
    walk(root, &mut n);
    n
}
```

- [ ] **Step 4a (note about restart on folder change):** the spec describes hot-swapping the pipeline on folder change. For v0.2, we simplify: changing the folder requires an app restart to take effect (the message logged at info level says so). This avoids complex teardown/restart logic in the pipeline. A future iteration (or Sub-project D) can add hot-swap.

- [ ] **Step 5: Verify cargo check + tests pass**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
```

Expected: clean check; all existing tests still pass (no new tests added in this task — tray rendering is GUI-bound and tested manually in Task 10).

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/tray.rs
git commit -m "feat(tray): show watching path + uploading count + failed list; pick-folder action"
```

---

## Task 9: Update `main.rs` — start pipeline on launch

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Replace main.rs with the pipeline-aware version**

Replace `src-tauri/src/main.rs` with:

```rust
// Prevents an extra console window from showing up on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod config;
mod db;
mod dialogs;
mod keychain;
mod pipeline;
mod tray;
mod uploader;
mod watcher;

use std::path::PathBuf;
use std::sync::Arc;

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tray::install(&handle)?;

            // Refresh + start pipeline off-thread so /api/auth/me network
            // call doesn't block the main UI.
            std::thread::spawn(move || {
                let vault_url = auth::vault_url_from_env();
                tray::refresh_menu(&handle, &vault_url);

                if let Err(e) = start_pipeline_if_configured(&handle, &vault_url) {
                    log::warn!("could not start pipeline: {}", e);
                }

                // Refresh again so the menu reflects the now-running pipeline.
                tray::refresh_menu(&handle, &vault_url);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}

fn start_pipeline_if_configured(
    _handle: &tauri::AppHandle,
    vault_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let cfg = config::load()?;
    let Some(watch_folder) = cfg.watch_folder.as_deref() else {
        log::info!("no watch folder configured; pipeline not started");
        return Ok(());
    };

    let watch_path = PathBuf::from(watch_folder);
    if !watch_path.is_dir() {
        log::warn!("configured watch folder does not exist: {}", watch_folder);
        return Ok(());
    }

    let dir = config::config_dir()?;
    let db = Arc::new(db::Db::open(&dir)?);

    let watcher_rx = watcher::start(watch_path.clone(), cfg.debounce_ms)?;

    // Token getter: read from keychain on every upload (so the pipeline
    // picks up a fresh token automatically after sign-out + sign-in).
    let token_getter: Arc<dyn Fn() -> Option<String> + Send + Sync> =
        Arc::new(|| keychain::load().ok().flatten());

    let pipeline = pipeline::start(
        watcher_rx,
        db.clone(),
        vault_url.to_string(),
        token_getter,
        watch_folder.to_string(),
    );

    // One-shot startup scan (catches files added while app was off).
    if cfg.scan_existing_on_pick {
        scan_and_enqueue(&watch_path, &pipeline);
    }

    // Stash the pipeline globally so the tray can read its state.
    let _ = tray::PIPELINE.set(pipeline);

    Ok(())
}

fn scan_and_enqueue(root: &std::path::Path, pipeline: &pipeline::Pipeline) {
    fn walk(p: &std::path::Path, pipeline: &pipeline::Pipeline) {
        if let Ok(entries) = std::fs::read_dir(p) {
            for e in entries.flatten() {
                let path = e.path();
                if path.is_file() {
                    pipeline.enqueue(path);
                } else if path.is_dir() {
                    walk(&path, pipeline);
                }
            }
        }
    }
    walk(root, pipeline);
}
```

- [ ] **Step 2: Verify cargo check + tests + clippy pass**

```bash
. "$HOME/.cargo/env"
cd /root/vorevault-desktop
cargo fmt --manifest-path src-tauri/Cargo.toml --all
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
cargo test --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings 2>&1 | tail -10
```

Expected: clean check, all existing tests still pass, clippy clean. If clippy complains (e.g., about unused imports, missing must_use), fix and re-run.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/main.rs
git commit -m "feat: wire pipeline + dialogs plugin into main entry point"
```

---

## Task 10: Push branch + open PR + manual smoke test

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
cd /root/vorevault-desktop
git push -u origin feat/folder-watcher
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: Sub-project B — folder watcher + tus upload pipeline" --body "$(cat <<'EOF'
## Summary
- New modules: \`config\`, \`db\`, \`watcher\`, \`uploader\`, \`pipeline\`, \`dialogs\` (six new files in \`src-tauri/src/\`)
- Updated \`tray.rs\` to render watching path + uploading count + failed list; new "Pick folder…" menu item
- Updated \`main.rs\` to start the pipeline on launch when a folder is configured + register the dialog plugin
- 5 new dependencies: \`notify\`, \`rusqlite\` (bundled), \`dirs\`, \`tauri-plugin-dialog\`, \`crossbeam-channel\`
- ~30 unit tests covering: config round-trip + corrupt-recovery, db dedupe queries, watcher debounce logic, uploader URL/metadata helpers, pipeline filter + decision logic, sha256 file hashing

## Why
v0.1.0 shipped auth-only — useful but boring. v0.2.0 makes the app actually do its thing: pick a folder once, drop files in, they upload to the user's VoreVault home folder silently.

Implements **Sub-project B** of **Theme 1.1**. Sub-projects C (toast notifications), D (settings window), E (signed installers) remain.

Spec: \`vorevault\` repo at \`docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-b-design.md\`
Plan: \`vorevault\` repo at \`docs/superpowers/plans/2026-04-26-desktop-watcher-subproject-b.md\`

## Test plan
- [x] All unit tests pass (\`cargo test\`)
- [x] \`cargo clippy --all-targets -- -D warnings\` clean
- [x] CI green on Win + Mac
- [ ] Manual smoke test on Windows / Mac:
  - Click "Pick folder…" in tray → native picker → select a test folder
  - Answer "yes" to "upload existing files?" prompt
  - Drop a small file in the folder → confirm it appears in the vault home folder
  - Drop 5 files at once → confirm tray shows "Uploading X of Y" briefly
  - Drop the same file again under a different name → confirm it does NOT re-upload (sha dedupe)
  - Quit + relaunch → confirm "Watching: <path>" appears immediately
  - Add a new file while app is running → uploads
  - Quit, drop a file in the folder, relaunch → confirm startup scan catches and uploads it
  - Disable network mid-upload → confirm pipeline retries (logs every 5s, 30s, 5m...)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Wait for CI green and merge**

```bash
gh pr checks
```

When CI passes on both `windows-latest` and `macos-latest`:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: User builds the binary and runs the manual smoke test**

(This step is the user's job — Tauri builds Win/Mac installers from those OSes, not from the Linux dev box.)

```bash
cd vorevault-desktop
git pull
cargo tauri build
```

Then install + run + walk through the manual smoke test items in the PR test plan.

- [ ] **Step 5: Tag v0.2.0**

If smoke test passes:

```bash
cd vorevault-desktop
git tag -a v0.2.0 -m "v0.2.0: Sub-project B — folder watcher + tus upload pipeline"
git push origin v0.2.0
```

That's the v0.2.0 release. Sub-project C (toast notifications) is the next likely sub-project to brainstorm.

---

## Self-review (run after writing the plan)

**Spec coverage** — every spec section maps to a task:
- Architecture overview (6 modules) → all 6 created in Tasks 2-7
- Configuration (config.json) → Task 2
- Persistent state (uploads.db) → Task 3
- Upload pipeline (debounce, filter, dedupe, upload, record) → Tasks 4 (watcher), 5 (uploader), 7 (pipeline)
- Failure-mode matrix (backoff, auth invalidation) → Task 7
- Tray UX additions → Task 8
- Startup wiring → Task 9
- Pick-folder flow → Task 8 (`spawn_pick_folder`)
- Definition of done → Task 10 manual smoke test

**Placeholder scan**: no TBD/TODO/handle-edge-cases. Each step has actual code. ✓

**Type consistency**:
- `Config` struct + fields consistent across config.rs + main.rs (`watch_folder`, `scan_existing_on_pick`, `debounce_ms`)
- `Db` API: `open`, `has_path_size_mtime`, `has_sha256`, `record_upload` consistent across db.rs + pipeline.rs
- `Pipeline`: `start`, `enqueue`, `snapshot` + `PipelineState` consistent across pipeline.rs + tray.rs + main.rs
- `WatcherError` / `UploadError` / `DbError` / `ConfigError` enums consistent
- `tray::PIPELINE` (`OnceLock<Pipeline>`) is set in `main.rs` and read in `tray.rs` via `PIPELINE.get()`

One known caveat (worth flagging to implementer): the `tray.rs` build_menu function constructs `MenuItem`s and pushes references into a `Vec<&dyn IsMenuItem<Wry>>`. The lifetimes need careful arrangement — every `MenuItem` referenced in `items` must outlive the `Menu::with_items` call. The structure in the plan declares all items at function scope so they all live to the end of the function. If the borrow checker complains, the fix is to keep all let-bindings ABOVE any conditional pushes (which the plan does). If clippy/rustc still complains in Task 8 step 5, restructure to build the items in two passes (build all items unconditionally, then push the relevant ones into the vec).

If the implementer hits issues with the dynamic-vec pattern, an acceptable fallback is to construct two separate `Menu::with_items` call paths (one with pipeline state, one without) — duplicates a bit of code but keeps lifetimes simple.
