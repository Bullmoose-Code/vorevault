# Desktop Watcher — Sub-project C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.3.0 of `vorevault-desktop`: native OS toast notifications on upload success and failure, with batch-on-drain so a burst of files produces one summary toast, plus a tray menu toggle to silence them. Toasts are informational only (no click navigation — `tauri-plugin-notification` v2 desktop has no click callback).

**Architecture:** One new module (`notifier.rs`), one struct refactor inside `pipeline.rs` to keep worker plumbing readable, one new field on `Config`, one new menu item in `tray.rs`, one plugin registration in `main.rs`. The pipeline tracks an `AtomicU32` "successes since last drain" counter; the moment the work queue plus in-flight count hits zero, the appropriate Single/Batch toast fires and the counter resets. Failures fire their own toast immediately, independently of the success batch.

**Tech Stack:** Rust 2021, existing Tauri 2.x setup. New dep: `tauri-plugin-notification = "2"`.

---

## Spec

`docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-c-design.md`. Read it for the full design (data flow, error handling, smoke tests, out-of-scope rationale — especially the no-click-callback constraint).

---

## Precondition

`feat/folder-watcher` (Sub-project B, PR #1 in `vorevault-desktop`) **must be merged to `main`** before starting Task 1. This plan branches off `main` and depends on B's modules (`pipeline.rs`, `notifier.rs`'s neighbor stubs, the dialog plugin registration, etc.). If B is still in flight, finish that first.

---

## File structure (in `vorevault-desktop` repo)

| Path | Status | Responsibility |
|---|---|---|
| `src-tauri/Cargo.toml` | **Modify** | Add `tauri-plugin-notification = "2"` |
| `src-tauri/src/notifier.rs` | **Create** | `NotifyEvent` enum, pure `title_and_body`, `notify(app, cfg, event)` that calls the plugin |
| `src-tauri/src/config.rs` | **Modify** | Add `notifications_enabled: bool` field, default `true` |
| `src-tauri/src/pipeline.rs` | **Modify** | Add `decide_notification` pure fn + tests; refactor worker plumbing into `WorkerCtx`; wire `on_success`/`on_failure` after each upload |
| `src-tauri/src/tray.rs` | **Modify** | Add "Show notifications: On / Off" menu item + handler |
| `src-tauri/src/main.rs` | **Modify** | Register `tauri_plugin_notification::init()`; pass `AppHandle` into `pipeline::start` |

---

## Conventions

- Rust 2021 edition; `cargo fmt` clean; `cargo clippy --all-targets -- -D warnings` clean
- TDD where pure logic exists (`title_and_body`, `decide_notification`)
- Plugin/IO code is intentionally NOT unit-tested in CI (covered by Task 7's manual smoke test)
- Run `cargo test` and `cargo clippy --all-targets -- -D warnings` from `/root/vorevault-desktop/src-tauri` before each commit
- Conventional Commits (`feat:`, `test:`, `fix:`, `chore:`, `refactor:`)

---

## Task 1: Branch + dependency + module scaffold

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/notifier.rs` (stub)
- Modify: `src-tauri/src/main.rs` (add `mod notifier;` and register plugin)
- Modify: `src-tauri/src/config.rs` (add `notifications_enabled` field + default)

- [ ] **Step 1: Create the feature branch**

```bash
cd /root/vorevault-desktop
git checkout main
git pull origin main
git checkout -b feat/notifications
```

- [ ] **Step 2: Add the dependency**

Edit `src-tauri/Cargo.toml`. Add to the bottom of `[dependencies]`:

```toml
tauri-plugin-notification = "2"
```

- [ ] **Step 3: Create the empty `notifier` module stub**

Create `src-tauri/src/notifier.rs` with just:

```rust
//! Native OS toast notifications for upload events. Informational only —
//! `tauri-plugin-notification` v2 desktop has no click callback, so toasts
//! cannot navigate. They simply appear, briefly, and dismiss themselves
//! (or get folded into Action Center / Notification Center on click).
```

- [ ] **Step 4: Add the `notifications_enabled` field to Config**

Edit `src-tauri/src/config.rs`. Add the field to `pub struct Config` (after `debounce_ms`):

```rust
pub notifications_enabled: bool,
```

And add the default to `impl Default for Config` (after `debounce_ms: 5000,`):

```rust
notifications_enabled: true,
```

The struct already has `#[serde(default)]` so existing `config.json` files will be backfilled with `true` automatically — no migration step.

- [ ] **Step 5: Wire the new module + plugin into main.rs**

Edit `src-tauri/src/main.rs`. The existing `mod` block is alphabetically ordered (`auth`, `config`, `db`, `dialogs`, `keychain`, `pipeline`, `tray`, `uploader`, `watcher`). Insert `mod notifier;` between `keychain` and `pipeline`:

```rust
mod keychain;
mod notifier;
mod pipeline;
```

Then in `tauri::Builder::default()`, after `.plugin(tauri_plugin_dialog::init())`, add:

```rust
.plugin(tauri_plugin_notification::init())
```

- [ ] **Step 6: cargo check**

Run from `/root/vorevault-desktop/src-tauri`:

```bash
cargo check --color never
```

Expected: clean build, no warnings.

- [ ] **Step 7: Run existing tests to confirm nothing broke**

```bash
cargo test --color never 2>&1 | tail -10
```

Expected: 41 passed, 0 failed (same baseline as `feat/folder-watcher`).

- [ ] **Step 8: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml src-tauri/src/notifier.rs src-tauri/src/main.rs src-tauri/src/config.rs
git commit -m "$(cat <<'EOF'
chore(deps): add tauri-plugin-notification + scaffold notifier module

Empty notifier.rs stub, plugin registered in main.rs, new
config.notifications_enabled bool defaulting to true. No behaviour change
yet — wiring only.

EOF
)"
```

---

## Task 2: notifier — `title_and_body` pure formatter (TDD)

**Files:**
- Modify: `src-tauri/src/notifier.rs`

- [ ] **Step 1: Write the failing tests**

Append to `src-tauri/src/notifier.rs`:

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum NotifyEvent {
    Single { filename: String },
    Batch { count: u32 },
    Failure { filename: String, watch_folder: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_success_title_and_body() {
        let (title, body) = title_and_body(&NotifyEvent::Single {
            filename: "clip.mp4".into(),
        });
        assert_eq!(title, "VoreVault");
        assert_eq!(body, "Uploaded clip.mp4 ✓");
    }

    #[test]
    fn batch_success_title_and_body() {
        let (title, body) = title_and_body(&NotifyEvent::Batch { count: 5 });
        assert_eq!(title, "VoreVault");
        assert_eq!(body, "Uploaded 5 clips ✓");
    }

    #[test]
    fn batch_count_pluralization_singular_edge() {
        // count=1 should never reach Batch (Single is used instead), but
        // defensively the formatter should still produce sensible output.
        let (_, body) = title_and_body(&NotifyEvent::Batch { count: 1 });
        assert_eq!(body, "Uploaded 1 clip ✓");
    }

    #[test]
    fn failure_title_and_body_includes_folder() {
        let (title, body) = title_and_body(&NotifyEvent::Failure {
            filename: "clip.mp4".into(),
            watch_folder: "C:\\Users\\ryan\\Clips".into(),
        });
        assert_eq!(title, "VoreVault — upload failed");
        assert_eq!(body, "clip.mp4 in C:\\Users\\ryan\\Clips");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test --color never notifier 2>&1 | tail -10
```

Expected: build error "cannot find function `title_and_body` in this scope".

- [ ] **Step 3: Write the minimal implementation**

In `src-tauri/src/notifier.rs`, before the `#[cfg(test)]` block, add:

```rust
/// Pure formatter — given an event, return (title, body) for the toast.
pub fn title_and_body(event: &NotifyEvent) -> (String, String) {
    match event {
        NotifyEvent::Single { filename } => (
            "VoreVault".to_string(),
            format!("Uploaded {} ✓", filename),
        ),
        NotifyEvent::Batch { count } => {
            let noun = if *count == 1 { "clip" } else { "clips" };
            (
                "VoreVault".to_string(),
                format!("Uploaded {} {} ✓", count, noun),
            )
        }
        NotifyEvent::Failure {
            filename,
            watch_folder,
        } => (
            "VoreVault — upload failed".to_string(),
            format!("{} in {}", filename, watch_folder),
        ),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test --color never notifier 2>&1 | tail -10
```

Expected: 4 tests in `notifier::tests` pass; previous 41 still pass.

- [ ] **Step 5: clippy + fmt**

```bash
cargo clippy --all-targets --color never -- -D warnings 2>&1 | tail -10
cargo fmt
```

Expected: clippy clean; fmt produces no diff.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/notifier.rs
git commit -m "$(cat <<'EOF'
feat(notifier): NotifyEvent enum + pure title_and_body formatter

Three variants (Single/Batch/Failure), test-covered. No plugin call yet —
that's the next task.

EOF
)"
```

---

## Task 3: notifier — `notify(app, cfg, event)` plugin call

**Files:**
- Modify: `src-tauri/src/notifier.rs`

- [ ] **Step 1: Add the `notify` function**

In `src-tauri/src/notifier.rs`, after the `title_and_body` definition (and before `#[cfg(test)]`), add:

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::config::Config;

/// Tracks whether we've already logged a notification permission warning.
/// macOS denies notification permission silently after the first prompt;
/// without this flag we'd spam the log on every upload.
static PERMISSION_WARNED: AtomicBool = AtomicBool::new(false);

/// Send a toast for the given event. No-ops if `cfg.notifications_enabled`
/// is false. Errors from the OS plugin are logged at warn (once) and
/// otherwise swallowed — uploads must keep working regardless of whether
/// notifications do.
pub fn notify(app: &AppHandle, cfg: &Config, event: NotifyEvent) {
    if !cfg.notifications_enabled {
        return;
    }
    let (title, body) = title_and_body(&event);
    let result = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
    if let Err(e) = result {
        if !PERMISSION_WARNED.swap(true, Ordering::Relaxed) {
            log::warn!(
                "notification send failed (further failures will be silent): {}",
                e
            );
        }
    }
}
```

- [ ] **Step 2: cargo check**

```bash
cd /root/vorevault-desktop/src-tauri
cargo check --color never 2>&1 | tail -10
```

Expected: clean (the function is defined but not yet called, so `dead_code` may complain — if so, add `#[allow(dead_code)]` to `notify` for now; Task 5 will use it and the attribute can come off then).

- [ ] **Step 3: Run tests + clippy**

```bash
cargo test --color never 2>&1 | tail -5
cargo clippy --all-targets --color never -- -D warnings 2>&1 | tail -10
```

Expected: tests pass; clippy clean (with the `#[allow(dead_code)]` if you added it).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/notifier.rs
git commit -m "$(cat <<'EOF'
feat(notifier): notify() function calls tauri-plugin-notification

Reads cfg.notifications_enabled to short-circuit when off. Logs plugin
send errors at warn level once per process, then suppresses (avoids
spam on macOS permission denial).

EOF
)"
```

---

## Task 4: pipeline — `decide_notification` pure function (TDD)

**Files:**
- Modify: `src-tauri/src/pipeline.rs`

- [ ] **Step 1: Write the failing tests**

Append to the `#[cfg(test)] mod tests` block at the bottom of `src-tauri/src/pipeline.rs`:

```rust
#[test]
fn decide_returns_none_when_disabled() {
    assert_eq!(
        decide_notification(0, 0, 5, false),
        NotificationAction::None
    );
}

#[test]
fn decide_returns_none_with_in_flight() {
    assert_eq!(
        decide_notification(1, 0, 5, true),
        NotificationAction::None
    );
}

#[test]
fn decide_returns_none_with_queued() {
    assert_eq!(
        decide_notification(0, 1, 5, true),
        NotificationAction::None
    );
}

#[test]
fn decide_returns_none_with_zero_successes() {
    assert_eq!(
        decide_notification(0, 0, 0, true),
        NotificationAction::None
    );
}

#[test]
fn decide_returns_single_for_one_success() {
    assert_eq!(
        decide_notification(0, 0, 1, true),
        NotificationAction::Single
    );
}

#[test]
fn decide_returns_batch_for_two_or_more() {
    assert_eq!(
        decide_notification(0, 0, 2, true),
        NotificationAction::Batch(2)
    );
    assert_eq!(
        decide_notification(0, 0, 17, true),
        NotificationAction::Batch(17)
    );
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test --color never decide_ 2>&1 | tail -15
```

Expected: build error "cannot find function `decide_notification`" / "cannot find type `NotificationAction`".

- [ ] **Step 3: Write the minimal implementation**

Near the top of `src-tauri/src/pipeline.rs` (after the existing imports and constants, before `pub enum UploadDecision`), add:

```rust
/// What kind of notification to fire after a successful upload, given the
/// current pipeline state. Pure — drives `notifier::notify`.
#[derive(Debug, PartialEq)]
pub enum NotificationAction {
    None,
    Single,
    Batch(u32),
}

/// Pure decision: should we fire a toast right now, and what kind?
pub fn decide_notification(
    in_flight: u32,
    queued: u32,
    successes_this_drain: u32,
    notifications_enabled: bool,
) -> NotificationAction {
    if !notifications_enabled {
        return NotificationAction::None;
    }
    if in_flight + queued > 0 {
        return NotificationAction::None;
    }
    match successes_this_drain {
        0 => NotificationAction::None,
        1 => NotificationAction::Single,
        n => NotificationAction::Batch(n),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cargo test --color never decide_ 2>&1 | tail -10
```

Expected: 6 new `decide_*` tests pass; full suite still green.

- [ ] **Step 5: clippy + fmt**

```bash
cargo clippy --all-targets --color never -- -D warnings 2>&1 | tail -10
cargo fmt
```

Expected: clippy clean; fmt no-op.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/pipeline.rs
git commit -m "$(cat <<'EOF'
feat(pipeline): decide_notification pure fn for batch-on-drain rule

Returns Single when exactly one success has accumulated and the queue
has fully drained, Batch(n) when 2+ have, None otherwise. Test-covered
across all branches.

EOF
)"
```

---

## Task 5: pipeline — wire AppHandle, success counter, on_success/on_failure

This is the biggest task. It refactors worker plumbing into a `WorkerCtx` struct (so the parameter list stays sane) and wires the notifier calls into `process_one`.

**Files:**
- Modify: `src-tauri/src/pipeline.rs`
- Modify: `src-tauri/src/main.rs` (pass `AppHandle` into `pipeline::start`)

- [ ] **Step 1: Add new imports + `WorkerCtx` struct**

Edit `src-tauri/src/pipeline.rs`. At the top of the file, alongside the existing `use` statements, add:

```rust
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::AppHandle;
```

Then **after** the existing `pub struct Pipeline { ... }` block (and before `impl Pipeline { ... }`), add:

```rust
/// Bundle of everything a worker thread needs to process one path.
/// Cloned-in via Arc/AppHandle::clone for each worker.
struct WorkerCtx {
    db: Arc<Db>,
    vault_url: String,
    get_token: Arc<dyn Fn() -> Option<String> + Send + Sync>,
    state: Arc<Mutex<PipelineState>>,
    work_rx: Receiver<PathBuf>,
    app: AppHandle,
    successes_this_drain: Arc<AtomicU32>,
    notify_lock: Arc<Mutex<()>>,
    watch_folder: String,
}
```

(Note: `Arc`, `Mutex`, `Sender`, `Receiver`, `crossbeam_channel` are already imported.)

- [ ] **Step 2: Update `pipeline::start` signature + worker spawn**

Replace the entire `pub fn start(...)` function body in `src-tauri/src/pipeline.rs` with:

```rust
pub fn start(
    watcher_rx: Receiver<PathBuf>,
    db: Arc<Db>,
    vault_url: String,
    get_session_token: Arc<dyn Fn() -> Option<String> + Send + Sync>,
    watching_path: String,
    app: AppHandle,
) -> Pipeline {
    let (enqueue_tx, enqueue_rx) = crossbeam_channel::unbounded::<PathBuf>();
    let state = Arc::new(Mutex::new(PipelineState {
        watching_path: Some(watching_path.clone()),
        ..Default::default()
    }));
    let successes_this_drain = Arc::new(AtomicU32::new(0));
    let notify_lock = Arc::new(Mutex::new(()));

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
        let ctx = WorkerCtx {
            db: db.clone(),
            vault_url: vault_url.clone(),
            get_token: get_session_token.clone(),
            state: state.clone(),
            work_rx: work_rx.clone(),
            app: app.clone(),
            successes_this_drain: successes_this_drain.clone(),
            notify_lock: notify_lock.clone(),
            watch_folder: watching_path.clone(),
        };
        std::thread::spawn(move || {
            while let Ok(path) = ctx.work_rx.recv() {
                process_one(&ctx, &path);
            }
        });
    }

    Pipeline {
        state,
        enqueue: enqueue_tx,
    }
}
```

- [ ] **Step 3: Update `process_one` signature + add notifier calls at the tail**

Replace the entire `fn process_one(...)` function in `src-tauri/src/pipeline.rs` (the existing 6-arg version) with:

```rust
fn process_one(ctx: &WorkerCtx, path: &Path) {
    // Quick metadata + filter pass.
    let meta = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return,
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
    let cheap = ctx
        .db
        .has_path_size_mtime(&path_str, size, mtime_unix)
        .unwrap_or(false);

    match decide(filename, is_regular, is_symlink, size, cheap, None) {
        UploadDecision::Filter => return,
        UploadDecision::AlreadyUploadedSamePath => return,
        UploadDecision::AlreadyUploadedDifferentPath => unreachable!("only with Some(true) sha"),
        UploadDecision::Proceed => {}
    }

    let sha256 = match sha256_file(path) {
        Ok(s) => s,
        Err(_) => return,
    };
    let sha_match = ctx.db.has_sha256(&sha256).unwrap_or(false);

    if sha_match {
        let row = UploadedRow {
            path: path_str.clone(),
            size,
            mtime_unix,
            sha256: sha256.clone(),
            uploaded_at: now_unix(),
        };
        let _ = ctx.db.record_upload(&row);
        return;
    }

    {
        let mut s = ctx.state.lock().unwrap();
        s.uploading += 1;
    }

    let mut attempt: usize = 0;
    let result = loop {
        let token = match (ctx.get_token)() {
            Some(t) => t,
            None => {
                let mut s = ctx.state.lock().unwrap();
                s.auth_invalid = true;
                break Err(UploadError::Unauthorized);
            }
        };
        match uploader::upload_file(&ctx.vault_url, &token, path) {
            Ok(()) => break Ok(()),
            Err(UploadError::Unauthorized) => {
                let mut s = ctx.state.lock().unwrap();
                s.auth_invalid = true;
                break Err(UploadError::Unauthorized);
            }
            Err(UploadError::TooLarge) => break Err(UploadError::TooLarge),
            Err(e) => {
                if attempt >= BACKOFF.len() {
                    log::warn!(
                        "giving up on {} after {} attempts: {}",
                        path.display(),
                        attempt + 1,
                        e
                    );
                    break Err(e);
                }
                let delay = BACKOFF[attempt];
                log::info!(
                    "upload failed (attempt {}): {} — retrying in {:?}",
                    attempt + 1,
                    e,
                    delay
                );
                std::thread::sleep(delay);
                attempt += 1;
            }
        }
    };

    {
        let mut s = ctx.state.lock().unwrap();
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
        let _ = ctx.db.record_upload(&row);
        on_success(ctx, filename);
    } else {
        on_failure(ctx, filename);
    }
}

/// Bumps the success counter; if the queue has fully drained, fires the
/// appropriate Single or Batch toast and resets the counter. The
/// `notify_lock` mutex serializes the check-and-fire so two workers that
/// finish at the same time can't both fire.
fn on_success(ctx: &WorkerCtx, filename: &str) {
    ctx.successes_this_drain.fetch_add(1, Ordering::Relaxed);

    let _g = ctx.notify_lock.lock().unwrap();

    let in_flight = ctx.state.lock().unwrap().uploading as u32;
    let queued = ctx.work_rx.len() as u32;
    let cfg = crate::config::load().unwrap_or_default();

    let action = decide_notification(
        in_flight,
        queued,
        ctx.successes_this_drain.load(Ordering::Relaxed),
        cfg.notifications_enabled,
    );

    match action {
        NotificationAction::None => {}
        NotificationAction::Single => {
            crate::notifier::notify(
                &ctx.app,
                &cfg,
                crate::notifier::NotifyEvent::Single {
                    filename: filename.to_string(),
                },
            );
            ctx.successes_this_drain.store(0, Ordering::Relaxed);
        }
        NotificationAction::Batch(n) => {
            crate::notifier::notify(
                &ctx.app,
                &cfg,
                crate::notifier::NotifyEvent::Batch { count: n },
            );
            ctx.successes_this_drain.store(0, Ordering::Relaxed);
        }
    }
}

/// Permanent failure — fire the failure toast immediately. Doesn't touch
/// the success batch counter.
fn on_failure(ctx: &WorkerCtx, filename: &str) {
    let cfg = crate::config::load().unwrap_or_default();
    crate::notifier::notify(
        &ctx.app,
        &cfg,
        crate::notifier::NotifyEvent::Failure {
            filename: filename.to_string(),
            watch_folder: ctx.watch_folder.clone(),
        },
    );
}
```

- [ ] **Step 4: Update `main.rs` to pass AppHandle into `pipeline::start`**

Edit `src-tauri/src/main.rs`. In `start_pipeline_if_configured`, change the `pipeline::start(...)` call to pass the handle:

```rust
let pipeline = pipeline::start(
    watcher_rx,
    db.clone(),
    vault_url.to_string(),
    token_getter,
    watch_folder.to_string(),
    _handle.clone(),
);
```

Also rename the function's `_handle` parameter to `handle` (since it's now actually used) and update the call to use `handle.clone()`:

```rust
pub(crate) fn start_pipeline_if_configured(
    handle: &tauri::AppHandle,
    vault_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // ... existing body ...

    let pipeline = pipeline::start(
        watcher_rx,
        db.clone(),
        vault_url.to_string(),
        token_getter,
        watch_folder.to_string(),
        handle.clone(),
    );
    // ...
}
```

- [ ] **Step 5: Remove the `#[allow(dead_code)]` from `notify` in notifier.rs (if you added one)**

If Task 3 step 2 made you add `#[allow(dead_code)]` to silence the warning, remove it now — `notify` is called from `on_success` and `on_failure`.

- [ ] **Step 6: cargo check + tests**

```bash
cd /root/vorevault-desktop/src-tauri
cargo check --color never 2>&1 | tail -10
cargo test --color never 2>&1 | tail -10
```

Expected: clean build; all tests pass (47+ now: 41 existing + 4 notifier + 6 decide).

- [ ] **Step 7: clippy + fmt**

```bash
cargo clippy --all-targets --color never -- -D warnings 2>&1 | tail -15
cargo fmt
```

Expected: clippy clean; fmt no-op.

- [ ] **Step 8: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/pipeline.rs src-tauri/src/main.rs src-tauri/src/notifier.rs
git commit -m "$(cat <<'EOF'
feat(pipeline): wire AppHandle + on_success/on_failure to notifier

Refactor worker thread plumbing into a WorkerCtx struct so the addition
of AppHandle, the AtomicU32 success counter, and the notify_lock Mutex
doesn't push process_one's signature past readability.

on_success bumps the counter, snapshots in_flight + queued under the
notify_lock, calls decide_notification, and fires the right toast (or
none). on_failure fires the failure toast immediately and independently.

EOF
)"
```

---

## Task 6: tray — "Show notifications: On / Off" toggle

**Files:**
- Modify: `src-tauri/src/tray.rs`

- [ ] **Step 1: Add menu item to `build_menu` (signed-in-with-pipeline branch only)**

Edit `src-tauri/src/tray.rs`. In `build_menu`, inside the `(Some(username), Some(p)) =>` arm — find the section where `let pick = MenuItem::with_id(app, "pick-folder", ...)?;` is built, and add immediately after it:

```rust
let cfg_for_label = crate::config::load().unwrap_or_default();
let notif_label = if cfg_for_label.notifications_enabled {
    "Show notifications: On"
} else {
    "Show notifications: Off"
};
let notif = MenuItem::with_id(
    app,
    "toggle-notifications",
    notif_label,
    true,
    None::<&str>,
)?;
```

Then in the `items.push(...)` sequence, insert `items.push(&notif);` right after `items.push(&pick);`:

```rust
items.push(&sep1);
items.push(&pick);
items.push(&notif);  // <-- NEW
items.push(&sep2);
items.push(&signout);
items.push(&quit);
```

- [ ] **Step 2: Add the menu event handler**

Edit `src-tauri/src/tray.rs`. In `handle_menu_event`, add a new match arm before the `_ => {}` default:

```rust
"toggle-notifications" => spawn_toggle_notifications(app.clone()),
```

- [ ] **Step 3: Implement `spawn_toggle_notifications`**

Edit `src-tauri/src/tray.rs`. After `spawn_pick_folder` (and before `do_pick_folder`), add:

```rust
fn spawn_toggle_notifications(app: AppHandle) {
    std::thread::spawn(move || {
        let mut cfg = crate::config::load().unwrap_or_default();
        cfg.notifications_enabled = !cfg.notifications_enabled;
        if let Err(e) = crate::config::save(&cfg) {
            log::warn!("failed to save notifications toggle: {}", e);
            return;
        }
        log::info!(
            "notifications toggled to {}",
            if cfg.notifications_enabled { "on" } else { "off" }
        );
        let vault_url = crate::auth::vault_url_from_env();
        refresh_menu(&app, &vault_url);
    });
}
```

- [ ] **Step 4: cargo check + clippy**

```bash
cd /root/vorevault-desktop/src-tauri
cargo check --color never 2>&1 | tail -10
cargo clippy --all-targets --color never -- -D warnings 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 5: Run all tests**

```bash
cargo test --color never 2>&1 | tail -10
```

Expected: 47+ tests pass.

- [ ] **Step 6: fmt**

```bash
cargo fmt
```

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/tray.rs
git commit -m "$(cat <<'EOF'
feat(tray): "Show notifications: On / Off" toggle

Reads/writes config.notifications_enabled, refreshes menu after toggle.
Sits between Pick folder… and Sign out in the signed-in menu.

EOF
)"
```

---

## Task 7: Push, open PR, manual smoke test

**Files:** none (publishing + manual verification)

- [ ] **Step 1: Push the branch**

```bash
cd /root/vorevault-desktop
git push -u origin feat/notifications
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: native upload notifications (Sub-project C, v0.3.0)" --body "$(cat <<'EOF'
## Summary

Closes Sub-project C of the desktop watcher roadmap (Theme 1.1).

- New `notifier.rs` module wrapping `tauri-plugin-notification` v2.
- Pipeline emits Single / Batch / Failure events through a pure
  `decide_notification` rule: bursts collapse into one summary toast,
  failures fire immediately and independently.
- New tray toggle "Show notifications: On / Off".
- Toasts are informational only — `tauri-plugin-notification` v2 desktop
  has no click callback, documented in the spec under Out of scope.

## Spec & plan

- `vorevault` repo: `docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-c-design.md`
- `vorevault` repo: `docs/superpowers/plans/2026-04-26-desktop-watcher-subproject-c.md`

## Manual smoke test

1. `cargo tauri build`, install the new MSI/DMG, launch.
2. Drop 1 file into the watch folder → expect one toast "Uploaded clip.mp4 ✓".
3. Drop 5 files at once → expect one batch toast "Uploaded 5 clips ✓" once they finish.
4. Disconnect network, drop 1 file, wait for retries to exhaust (a few minutes) → expect failure toast "clip.mp4 in <watch folder>".
5. Tray menu → click "Show notifications: On" → label flips to Off → drop file → no toast.
6. Click again → label back to On → drop file → toast resumes.
7. macOS first run: expect OS permission prompt; grant it.
8. Enable Windows Focus Assist (or macOS Focus / Do Not Disturb), drop file → no toast (suppressed by OS).

## Test plan

- [ ] Smoke test step 2 (single)
- [ ] Smoke test step 3 (batch)
- [ ] Smoke test step 4 (failure)
- [ ] Smoke test step 5/6 (toggle)
- [ ] Smoke test step 7 (macOS perm) if a Mac is available
- [ ] Smoke test step 8 (Focus Assist)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI**

```bash
gh pr checks --watch
```

Expected: both `Build & test (macos-latest)` and `Build & test (windows-latest)` pass.

- [ ] **Step 4: Hand off to user for manual smoke test**

Tell the user the PR is up, CI is green, and the smoke-test checklist is in the PR body. They run through it on their Windows + Mac install, report back. Once they confirm, they merge and tag v0.3.0:

```bash
git checkout main
git pull
git tag -a v0.3.0 -m "v0.3.0: Sub-project C — native upload notifications"
git push origin v0.3.0
```

---

## Done

After Task 7's merge + tag, Sub-project C is shipped. Theme 1.1 still has D (settings window) and E (signed installers) outstanding before it can be called complete.
