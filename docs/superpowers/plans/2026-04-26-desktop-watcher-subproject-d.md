# Desktop Watcher — Sub-project D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship vorevault-desktop **v0.4.0** — a brand-styled settings window plus a soft-pause uploads tray toggle. Replaces the post-auth native folder-picker dialog from Sub-project C with an auto-opening settings window for first-run.

**Architecture:** New Rust module `settings_window.rs` owns a single Tauri `WebviewWindow` (single-instance, hide-on-close). The window's HTML/CSS/JS lives in a new `src-tauri/ui/` directory bundled into the binary. JS calls into Rust via `#[tauri::command]`s; Rust pushes state changes back via `app.emit("settings:state-changed", state)`. A new `PauseGate` in `pipeline.rs` parks worker threads when paused. Tray menu reorganized into a "hybrid" layout — frequent toggles (notifications, the new pause) stay; rare config (sign-out, change-folder) migrates to the window.

**Tech Stack:** Tauri 2 (Rust + WebView), `tauri-plugin-autostart` (new), plain HTML/CSS/JS (no frontend framework), self-hosted Fraunces/Inter/JetBrains Mono woff2 fonts. Implementation happens in **`/root/vorevault-desktop`** on a new branch `feat/settings-window`. The spec lives in this repo (`/root/vorevault`); commits to it (this plan, the spec) stay on `spec/desktop-watcher-d`.

**Spec:** `docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-d-design.md`

---

## Pre-task setup

- [ ] **Step 1: Create the implementation branch in vorevault-desktop**

```bash
cd /root/vorevault-desktop
git fetch origin
git checkout -b feat/settings-window origin/main
```

Expected: switched to a new branch tracking `origin/main`. Working tree clean.

- [ ] **Step 2: Confirm baseline build still works**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in ...`. No errors.

---

## Task 1: Add `tauri-plugin-autostart` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add the plugin to Cargo.toml**

Open `src-tauri/Cargo.toml`. Find the existing block of `tauri-plugin-*` lines (just below `tauri-plugin-notification = "2"`). Add this line:

```toml
tauri-plugin-autostart = "2"
```

- [ ] **Step 2: Verify dep resolves and compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: `Compiling tauri-plugin-autostart v2.x.x` appears, then a clean `Finished` line. If a `feature` flag is required, the cargo error will name it — add `features = ["..."]` per the suggestion and re-run.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(deps): add tauri-plugin-autostart for Sub-project D"
```

---

## Task 2: `PauseGate` in pipeline.rs (pure-logic helper, TDD)

**Files:**
- Modify: `src-tauri/src/pipeline.rs` (add `PauseGate` struct + tests at end of file)

The gate is a small Mutex+Condvar wrapper. We TDD it before wiring it into the worker loop in Task 3.

- [ ] **Step 1: Write the failing tests**

Open `src-tauri/src/pipeline.rs`. Find the `#[cfg(test)] mod tests {` block at the bottom. Add these tests inside the `mod tests {` block, after the existing tests:

```rust
    #[test]
    fn pause_gate_starts_unpaused() {
        let gate = super::PauseGate::new();
        assert!(!gate.is_paused());
    }

    #[test]
    fn pause_gate_set_paused_flips_state() {
        let gate = super::PauseGate::new();
        gate.set_paused(true);
        assert!(gate.is_paused());
        gate.set_paused(false);
        assert!(!gate.is_paused());
    }

    #[test]
    fn pause_gate_wait_returns_immediately_when_unpaused() {
        let gate = super::PauseGate::new();
        let start = std::time::Instant::now();
        gate.wait_while_paused();
        assert!(start.elapsed() < std::time::Duration::from_millis(50));
    }

    #[test]
    fn pause_gate_wait_unblocks_on_resume() {
        use std::sync::Arc;
        let gate = Arc::new(super::PauseGate::new());
        gate.set_paused(true);

        // Spawn a thread that will block in wait_while_paused.
        let gate_clone = gate.clone();
        let waiter = std::thread::spawn(move || {
            let start = std::time::Instant::now();
            gate_clone.wait_while_paused();
            start.elapsed()
        });

        // Give the waiter time to enter the wait.
        std::thread::sleep(std::time::Duration::from_millis(50));
        gate.set_paused(false);

        let elapsed = waiter.join().unwrap();
        // Waiter unblocked some time after we called set_paused(false).
        // Should be well under 200ms total.
        assert!(elapsed < std::time::Duration::from_millis(200), "waiter took {:?}", elapsed);
        assert!(elapsed >= std::time::Duration::from_millis(50));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test pause_gate 2>&1 | tail -10
```

Expected: compile error — `cannot find type 'PauseGate' in module 'super'`.

- [ ] **Step 3: Add the `PauseGate` implementation**

Find the existing `impl Pipeline {` block in `src-tauri/src/pipeline.rs` (around line 158). Insert this new struct + impl **before** the `impl Pipeline {` block:

```rust
/// Soft-pause gate for worker threads. When paused, workers calling
/// `wait_while_paused` block until `set_paused(false)` is called. In-flight
/// uploads are not interrupted — they finish naturally before the next
/// `wait_while_paused` call.
pub struct PauseGate {
    inner: std::sync::Arc<(std::sync::Mutex<bool>, std::sync::Condvar)>,
}

impl PauseGate {
    pub fn new() -> Self {
        PauseGate {
            inner: std::sync::Arc::new((std::sync::Mutex::new(false), std::sync::Condvar::new())),
        }
    }

    pub fn set_paused(&self, paused: bool) {
        let (lock, cvar) = &*self.inner;
        *lock.lock().unwrap() = paused;
        if !paused {
            cvar.notify_all();
        }
    }

    pub fn is_paused(&self) -> bool {
        let (lock, _) = &*self.inner;
        *lock.lock().unwrap()
    }

    /// Block while paused. Returns immediately if not paused.
    pub fn wait_while_paused(&self) {
        let (lock, cvar) = &*self.inner;
        let mut paused = lock.lock().unwrap();
        while *paused {
            paused = cvar.wait(paused).unwrap();
        }
    }
}

impl Clone for PauseGate {
    fn clone(&self) -> Self {
        PauseGate { inner: self.inner.clone() }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test pause_gate 2>&1 | tail -10
```

Expected: `test result: ok. 4 passed; 0 failed`.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): PauseGate (Mutex+Condvar) for soft-pause workers"
```

---

## Task 3: Wire `PauseGate` into worker loop + `Pipeline::set_paused`

**Files:**
- Modify: `src-tauri/src/pipeline.rs` (`WorkerCtx`, `Pipeline`, `start`, worker loop)

- [ ] **Step 1: Add `pause_gate` field to `WorkerCtx`**

Find `struct WorkerCtx {` in `src-tauri/src/pipeline.rs` (around line 144). Add this field at the end of the struct (after `in_forwarder`):

```rust
    pause_gate: PauseGate,
```

- [ ] **Step 2: Add `pause_gate` field to `Pipeline`**

Find `pub struct Pipeline {` (around line 138). Add this field after `enqueue`:

```rust
    pause_gate: PauseGate,
```

- [ ] **Step 3: Add `set_paused` and `is_paused` methods to `impl Pipeline`**

Find `impl Pipeline {` (now after the new `PauseGate` block from Task 2). Add these methods inside the impl block, after the existing `snapshot` method:

```rust
    pub fn set_paused(&self, paused: bool) {
        self.pause_gate.set_paused(paused);
    }

    pub fn is_paused(&self) -> bool {
        self.pause_gate.is_paused()
    }
```

- [ ] **Step 4: Construct the gate in `start` and clone into each worker**

Find the body of `pub fn start(...) -> Pipeline {` (around line 177). Just after the existing `let in_forwarder = Arc::new(AtomicUsize::new(0));` line, add:

```rust
    let pause_gate = PauseGate::new();
```

Then in the worker spawn loop (around line 219, `for _ in 0..NUM_WORKERS {`), inside the `WorkerCtx { ... }` literal, add `pause_gate: pause_gate.clone(),` as the last field.

Then update the returned `Pipeline { ... }` literal at the bottom of `start` (around line 239) to include `pause_gate,` after `enqueue: enqueue_tx,`.

- [ ] **Step 5: Wire the gate check into the worker loop**

Find the worker loop in `start` (around line 232-237):

```rust
        std::thread::spawn(move || {
            while let Ok(path) = ctx.work_rx.recv() {
                process_one(&ctx, &path);
            }
        });
```

Replace with:

```rust
        std::thread::spawn(move || {
            while let Ok(path) = ctx.work_rx.recv() {
                ctx.pause_gate.wait_while_paused();
                process_one(&ctx, &path);
            }
        });
```

(Pause check happens **after** recv, so a paused worker holds the next item and parks. When resume fires, the parked worker proceeds with that item.)

- [ ] **Step 6: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished` line. Existing pause_gate tests still pass:

```bash
cargo test pause_gate 2>&1 | tail -5
```

Expected: `4 passed; 0 failed`.

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/pipeline.rs
git commit -m "feat(pipeline): wire PauseGate into worker loop + Pipeline::set_paused API"
```

---

## Task 4: `SettingsState` struct + `format_path_for_button` helper (new file, TDD)

**Files:**
- Create: `src-tauri/src/settings_window.rs`
- Modify: `src-tauri/src/main.rs` (add `mod settings_window;`)

This is the foundation of the new module. We add the struct + the pure formatter helper now; window-creation logic comes in Task 5.

- [ ] **Step 1: Create the new module file with the struct + helper + failing tests**

Create `src-tauri/src/settings_window.rs` with this content:

```rust
//! Settings window: lifecycle, commands, and state-snapshot helpers.
//! Sub-project D of Theme 1.1. See
//! docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-d-design.md.

use serde::Serialize;
use std::path::PathBuf;

/// Single source of truth pushed to the settings window's JS layer on every
/// state change. JS re-renders the whole DOM on each update.
#[derive(Clone, Debug, Serialize)]
pub struct SettingsState {
    /// Discord username when signed in, `None` when signed out.
    pub username: Option<String>,
    /// Current watch folder. `None` on first-run before the user picks one.
    pub watch_folder: Option<PathBuf>,
    /// Pre-formatted display label for the watch folder button (truncated).
    /// `None` when `watch_folder` is `None`.
    pub watch_folder_label: Option<String>,
    /// Whether the upload pipeline is currently soft-paused.
    pub paused: bool,
    /// CARGO_PKG_VERSION at build time.
    pub version: &'static str,
}

/// Truncate a path to a button-friendly label.
/// - Paths shorter than `max_chars` are returned as-is.
/// - Longer paths are truncated with a leading ellipsis: "…/foo/bar".
/// - Multi-byte safe: counts chars, not bytes.
pub fn format_path_for_button(path: &std::path::Path, max_chars: usize) -> String {
    let s = path.display().to_string();
    let char_count = s.chars().count();
    if char_count <= max_chars {
        return s;
    }
    let keep = max_chars.saturating_sub(1);
    let suffix: String = s.chars().rev().take(keep).collect::<Vec<char>>().into_iter().rev().collect();
    format!("…{}", suffix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn format_short_path_returns_unchanged() {
        let p = PathBuf::from("/short");
        assert_eq!(format_path_for_button(&p, 28), "/short");
    }

    #[test]
    fn format_exact_length_path_returns_unchanged() {
        let p = PathBuf::from("/exactly-twenty-eight-chars/");
        assert_eq!(p.display().to_string().chars().count(), 28);
        assert_eq!(format_path_for_button(&p, 28), "/exactly-twenty-eight-chars/");
    }

    #[test]
    fn format_long_path_is_truncated_with_leading_ellipsis() {
        let p = PathBuf::from("/Users/ryan/Movies/Recordings/2026/clips/raw");
        let out = format_path_for_button(&p, 28);
        assert!(out.starts_with("…"));
        assert_eq!(out.chars().count(), 28);
        assert!(out.ends_with("clips/raw"));
    }

    #[test]
    fn format_path_with_multibyte_chars() {
        let p = PathBuf::from("/Users/ryan/Vidéos/clips-éphémères/raw/2026");
        let out = format_path_for_button(&p, 20);
        assert_eq!(out.chars().count(), 20);
        assert!(out.starts_with("…"));
    }

    #[test]
    fn format_root_path() {
        let p = PathBuf::from("/");
        assert_eq!(format_path_for_button(&p, 28), "/");
    }

    #[test]
    fn format_empty_max_chars_zero() {
        let p = PathBuf::from("/some/path");
        assert_eq!(format_path_for_button(&p, 0), "…");
    }
}
```

- [ ] **Step 2: Register the new module in `main.rs`**

Open `src-tauri/src/main.rs`. Find the `mod ...;` declarations near the top (lines 4-13). Insert this line, alphabetically between `mod pipeline;` and `mod tray;`:

```rust
mod settings_window;
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test format_path 2>&1 | tail -10
cargo test --lib settings_window 2>&1 | tail -10
```

Expected: 6 tests pass for `format_path_for_button`. No compile errors.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/settings_window.rs src-tauri/src/main.rs
git commit -m "feat(settings_window): SettingsState struct + format_path_for_button helper"
```

---

## Task 5: `current_state()` snapshot + `state-changed` emit helper (TDD)

**Files:**
- Modify: `src-tauri/src/settings_window.rs`

We add the function that snapshots current state from the various existing sources (config, keychain, pipeline) and a helper that emits it.

- [ ] **Step 1: Write the failing test**

Open `src-tauri/src/settings_window.rs`. Inside the `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn build_state_signed_out_no_folder() {
        let s = build_state_for_test(None, None, false);
        assert!(s.username.is_none());
        assert!(s.watch_folder.is_none());
        assert!(s.watch_folder_label.is_none());
        assert!(!s.paused);
        assert_eq!(s.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn build_state_signed_in_with_folder() {
        let p = PathBuf::from("/Users/ryan/clips");
        let s = build_state_for_test(Some("ryan".to_string()), Some(p.clone()), false);
        assert_eq!(s.username, Some("ryan".to_string()));
        assert_eq!(s.watch_folder, Some(p));
        assert_eq!(s.watch_folder_label, Some("/Users/ryan/clips".to_string()));
        assert!(!s.paused);
    }

    #[test]
    fn build_state_paused_long_path() {
        let p = PathBuf::from("/Users/ryan/Movies/Recordings/2026/clips/raw");
        let s = build_state_for_test(Some("ryan".to_string()), Some(p), true);
        assert!(s.paused);
        let label = s.watch_folder_label.unwrap();
        assert!(label.starts_with("…"));
        assert_eq!(label.chars().count(), 28);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test build_state 2>&1 | tail -10
```

Expected: compile error — `cannot find function 'build_state_for_test'`.

- [ ] **Step 3: Add the pure builder + a thin test wrapper**

In `src-tauri/src/settings_window.rs`, add this just below the `format_path_for_button` function (above the `#[cfg(test)]` block):

```rust
/// Maximum chars in the watch-folder button label before truncation.
const PATH_LABEL_MAX: usize = 28;

/// Pure builder — assembles a SettingsState from already-loaded inputs.
/// Real callers use `current_state(app)` which loads from config/keychain/pipeline.
fn build_state(
    username: Option<String>,
    watch_folder: Option<PathBuf>,
    paused: bool,
) -> SettingsState {
    let watch_folder_label = watch_folder
        .as_deref()
        .map(|p| format_path_for_button(p, PATH_LABEL_MAX));
    SettingsState {
        username,
        watch_folder,
        watch_folder_label,
        paused,
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[cfg(test)]
fn build_state_for_test(
    username: Option<String>,
    watch_folder: Option<PathBuf>,
    paused: bool,
) -> SettingsState {
    build_state(username, watch_folder, paused)
}

/// Snapshot the current settings state from production sources:
/// keychain (for signed-in username via cached pipeline state), config
/// (for watch_folder), and pipeline (for paused).
pub fn current_state(_app: &tauri::AppHandle) -> SettingsState {
    let pipeline_snapshot = crate::tray::PIPELINE
        .read()
        .unwrap()
        .as_ref()
        .map(|p| p.snapshot());
    let username = pipeline_snapshot.as_ref().and_then(|s| s.username.clone());
    let paused = crate::tray::PIPELINE
        .read()
        .unwrap()
        .as_ref()
        .map(|p| p.is_paused())
        .unwrap_or(false);
    let watch_folder = crate::config::load()
        .ok()
        .and_then(|c| c.watch_folder)
        .map(PathBuf::from);
    build_state(username, watch_folder, paused)
}

/// Emit "settings:state-changed" with the current snapshot. Cheap no-op when
/// the window is closed (no listeners).
pub fn emit_state_changed(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let state = current_state(app);
    if let Err(e) = app.emit("settings:state-changed", &state) {
        log::warn!("failed to emit settings:state-changed: {}", e);
    }
}
```

**Note:** This assumes `pipeline::PipelineState` has a `username: Option<String>` field. Verify:

```bash
grep -n "pub struct PipelineState\|username" /root/vorevault-desktop/src-tauri/src/pipeline.rs | head -10
```

If `PipelineState` does **not** have `username` today: add it. In `pipeline.rs`, the `PipelineState` struct (search for `pub struct PipelineState`) gains `pub username: Option<String>,`. Wherever the pipeline first learns the username (search for `auth/me` or `complete_sign_in`), update the state with it. This is a small addition (~5 lines) — do it as a separate commit before continuing.

This task also assumes the OnceLock → RwLock refactor from Task 8 has not yet happened; if it has been done out of order, the `.read().unwrap().as_ref()` calls already match.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test build_state 2>&1 | tail -10
cargo build 2>&1 | tail -5
```

Expected: 3 build_state tests pass. If `cargo build` fails because `PIPELINE.read()` doesn't exist yet (still a `OnceLock`), do the refactor from Task 8 Step 1 *now* and continue (commit it separately as described in Task 8). Otherwise the build is clean.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/settings_window.rs src-tauri/src/pipeline.rs
git status
git commit -m "feat(settings_window): build_state, current_state, emit_state_changed helpers"
```

---

## Task 6: Settings window builder (`show()` + hide-on-close)

**Files:**
- Modify: `src-tauri/src/settings_window.rs`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Declare the window in `tauri.conf.json`**

Open `src-tauri/tauri.conf.json`. Find `"app": { "windows": [],`. Replace `"windows": []` with:

```json
    "windows": [
      {
        "label": "settings",
        "title": "VoreVault",
        "url": "ui/settings.html",
        "width": 480,
        "height": 420,
        "resizable": false,
        "center": true,
        "decorations": true,
        "visible": false,
        "skipTaskbar": false
      }
    ],
```

Also update the `"build"` section's `"frontendDist"` field. Change `"frontendDist": "../ui-callback"` to `"frontendDist": "../ui"`.

(The OAuth success page in `ui-callback/success.html` is bundled separately via `include_str!` in `auth.rs`, so changing `frontendDist` does not break it.)

Add `"withGlobalTauri": true` inside the `"app"` block (so JS can use `window.__TAURI__` without ESM imports):

```json
    "app": {
      "withGlobalTauri": true,
      "windows": [ ... ],
      ...
    }
```

- [ ] **Step 2: Create the `ui/` directory placeholder so the build step has something to copy**

```bash
mkdir -p /root/vorevault-desktop/ui
printf '%s\n' '<!DOCTYPE html>' '<html><body>placeholder</body></html>' \
  > /root/vorevault-desktop/ui/settings.html
```

(Real HTML comes in Task 10. We create it now so `tauri build` doesn't choke on a missing path.)

- [ ] **Step 3: Add `show()` and `show_first_run()` to `settings_window.rs`**

In `src-tauri/src/settings_window.rs`, append these functions below the existing helpers (above `#[cfg(test)]`):

```rust
use tauri::Manager;

/// Open the settings window (or focus it if already open). Idempotent.
pub fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        if let Err(e) = window.show() {
            log::warn!("settings window show() failed: {}", e);
            return;
        }
        if let Err(e) = window.set_focus() {
            log::warn!("settings window set_focus() failed: {}", e);
        }
        return;
    }
    log::error!("settings window not found in app config");
}

/// First-run variant: same as show() today. Kept as a separate entry point so
/// we can later distinguish onboarding telemetry / behaviors if needed.
pub fn show_first_run(app: &tauri::AppHandle) {
    show(app);
}

/// Register the CloseRequested handler that hides instead of closing,
/// keeping the window object alive and listeners registered. Call this once
/// at app setup (from main.rs).
pub fn install_close_handler(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let w = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = w.hide();
            }
        });
    } else {
        log::warn!("settings window not yet created at install_close_handler time");
    }
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished`. Warnings about unused function `show_first_run` are OK (it'll be called in Task 14).

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/settings_window.rs src-tauri/tauri.conf.json ui/settings.html
git commit -m "feat(settings_window): window declaration + show/hide-on-close handlers"
```

---

## Task 7: Tauri commands — `get_state`, `set_autostart`, `get_autostart`

**Files:**
- Modify: `src-tauri/src/settings_window.rs`
- Modify: `src-tauri/src/main.rs` (register commands + autostart plugin)

- [ ] **Step 1: Add command handlers to settings_window.rs**

In `src-tauri/src/settings_window.rs`, append below `install_close_handler`:

```rust
#[tauri::command]
pub fn get_state(app: tauri::AppHandle) -> SettingsState {
    current_state(&app)
}

#[tauri::command]
pub fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("autostart read failed: {}", e))
}

#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    let res = if enabled { mgr.enable() } else { mgr.disable() };
    res.map_err(|e| format!("autostart write failed: {}", e))
}
```

- [ ] **Step 2: Register the autostart plugin and commands in main.rs**

In `src-tauri/src/main.rs`, find the `tauri::Builder::default()` chain (around line 21). Add the autostart plugin and `invoke_handler` registration:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            settings_window::get_state,
            settings_window::get_autostart,
            settings_window::set_autostart,
        ])
        .setup(|app| {
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished`. If an autostart plugin import is missing, add `use tauri_plugin_autostart::...` at the top of main.rs as suggested by the compiler.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/settings_window.rs src-tauri/src/main.rs
git commit -m "feat(settings_window): get_state/get_autostart/set_autostart commands + plugin wiring"
```

---

## Task 8: Refactor `tray::PIPELINE` from `OnceLock` to `RwLock<Option<Pipeline>>`

**Files:**
- Modify: `src-tauri/src/tray.rs` (PIPELINE static + all callers)
- Modify: `src-tauri/src/main.rs` (`tray::PIPELINE.set(...)` callsite)
- Modify: `src-tauri/src/notifier.rs` and any other `PIPELINE.get()` callers

This refactor enables runtime replacement of the pipeline (needed by `change_watch_folder` in Task 9). Today `OnceLock` only allows a single `set()` — once you've started the pipeline, you can't replace it with one watching a different folder.

- [ ] **Step 1: Find all `PIPELINE` references**

```bash
grep -rn "PIPELINE" /root/vorevault-desktop/src-tauri/src/ 2>&1
```

Expected: a definition in `tray.rs` and 3-5 `PIPELINE.get()` / `PIPELINE.set()` callsites in `tray.rs`, `main.rs`, possibly `notifier.rs`.

- [ ] **Step 2: Change the definition**

In `src-tauri/src/tray.rs`, find:

```rust
pub static PIPELINE: OnceLock<crate::pipeline::Pipeline> = OnceLock::new();
```

Replace with:

```rust
pub static PIPELINE: std::sync::RwLock<Option<crate::pipeline::Pipeline>> =
    std::sync::RwLock::new(None);
```

Remove the `use std::sync::OnceLock;` import (or leave it if other code still uses it).

- [ ] **Step 3: Update all `.get()` callers to `.read().unwrap().as_ref()`**

Pattern conversion:

| Before | After |
|---|---|
| `PIPELINE.get()` | `PIPELINE.read().unwrap().as_ref()` |
| `PIPELINE.get().is_none()` | `PIPELINE.read().unwrap().is_none()` |
| `PIPELINE.get().is_some()` | `PIPELINE.read().unwrap().is_some()` |
| `PIPELINE.get().map(\|p\| p.snapshot())` | `PIPELINE.read().unwrap().as_ref().map(\|p\| p.snapshot())` |

Apply all conversions found in Step 1.

- [ ] **Step 4: Update `PIPELINE.set(pipeline)` in `main.rs`**

In `src-tauri/src/main.rs`, find:

```rust
let _ = tray::PIPELINE.set(pipeline);
```

Replace with:

```rust
*tray::PIPELINE.write().unwrap() = Some(pipeline);
```

(This drops any prior pipeline, calling its Drop impl, which lets workers exit when their channels close.)

- [ ] **Step 5: Make `start_pipeline_if_configured` always replace, not just first-time set**

In `src-tauri/src/main.rs`, the function `start_pipeline_if_configured` already builds a new Pipeline and calls `PIPELINE.set(...)`. After Step 4 it always replaces. No further changes needed in this function.

- [ ] **Step 6: Verify it compiles + existing tests pass**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
cargo test 2>&1 | tail -10
```

Expected: clean `Finished`. All existing tests still pass (this is a non-behavioral refactor).

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/tray.rs src-tauri/src/main.rs src-tauri/src/notifier.rs
# (notifier.rs only if it had PIPELINE references)
git status
git commit -m "refactor(tray): PIPELINE OnceLock -> RwLock<Option<Pipeline>> for replacement"
```

---

## Task 9: Tauri commands — `change_watch_folder`, `sign_out`, `sign_in`

**Files:**
- Modify: `src-tauri/src/settings_window.rs` (new commands)
- Modify: `src-tauri/src/tray.rs` (add `pub` wrapper around existing `spawn_sign_in`)
- Modify: `src-tauri/src/main.rs` (extend `invoke_handler` list)

- [ ] **Step 1: Add `change_watch_folder` command**

In `src-tauri/src/settings_window.rs`, append:

```rust
#[tauri::command]
pub fn change_watch_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.is_dir() {
        return Err("can't access that folder".to_string());
    }

    // Persist to config.
    let mut cfg = crate::config::load().map_err(|e| format!("config load: {}", e))?;
    cfg.watch_folder = Some(path.clone());
    crate::config::save(&cfg).map_err(|e| format!("config save: {}", e))?;

    // Restart the pipeline on the new path.
    let vault_url = crate::auth::vault_url_from_env();
    if let Err(e) = crate::start_pipeline_if_configured(&app, &vault_url) {
        log::warn!("pipeline restart after folder change failed: {}", e);
    }

    crate::tray::refresh_menu(&app, &vault_url);
    emit_state_changed(&app);
    Ok(())
}
```

- [ ] **Step 2: Add `sign_out` command**

Append:

```rust
#[tauri::command]
pub fn sign_out(app: tauri::AppHandle) {
    let vault_url = crate::auth::vault_url_from_env();
    crate::auth::sign_out(&vault_url);
    // Stop pipeline by clearing it.
    {
        let mut guard = crate::tray::PIPELINE.write().unwrap();
        *guard = None;
    }
    crate::tray::refresh_menu(&app, &vault_url);
    emit_state_changed(&app);
}
```

- [ ] **Step 3: Add `sign_in` command (used by signed-out window state)**

Append:

```rust
#[tauri::command]
pub fn sign_in(app: tauri::AppHandle) {
    crate::tray::spawn_sign_in_command(app);
}
```

In `src-tauri/src/tray.rs`, add a `pub` wrapper that calls the existing internal `spawn_sign_in`. Place this near the top of the file, just below `pub fn refresh_menu`:

```rust
pub fn spawn_sign_in_command(app: tauri::AppHandle) {
    spawn_sign_in(app);
}
```

- [ ] **Step 4: Register the new commands in main.rs**

In `src-tauri/src/main.rs`, extend the `invoke_handler` list:

```rust
        .invoke_handler(tauri::generate_handler![
            settings_window::get_state,
            settings_window::get_autostart,
            settings_window::set_autostart,
            settings_window::change_watch_folder,
            settings_window::sign_out,
            settings_window::sign_in,
        ])
```

- [ ] **Step 5: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished`.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/settings_window.rs src-tauri/src/main.rs src-tauri/src/tray.rs
git commit -m "feat(settings_window): change_watch_folder/sign_out/sign_in commands"
```

---

## Task 10: Pipeline + auth wiring for `state-changed` emit

**Files:**
- Modify: `src-tauri/src/pipeline.rs` (emit on pause flip; add `app: AppHandle` to Pipeline)
- Modify: `src-tauri/src/auth.rs` (emit on sign-in success and sign-out)

- [ ] **Step 1: Add `app: AppHandle` to `Pipeline` struct**

In `src-tauri/src/pipeline.rs`, find `pub struct Pipeline { ... }`. Add field:

```rust
    app: tauri::AppHandle,
```

In `pub fn start(...) -> Pipeline {`, find the returned `Pipeline { ... }` literal and add:

```rust
        app: app.clone(),
```

(`app` is already a parameter of `start`, no signature change needed.)

- [ ] **Step 2: Emit when `Pipeline::set_paused` flips state**

Replace the `set_paused` method body added in Task 3 with:

```rust
    pub fn set_paused(&self, paused: bool) {
        let was = self.pause_gate.is_paused();
        self.pause_gate.set_paused(paused);
        if was != paused {
            crate::settings_window::emit_state_changed(&self.app);
        }
    }
```

- [ ] **Step 3: Find sign-in success site**

```bash
grep -n "complete\|exchange_succ\|keychain::save\|/api/auth/me" /root/vorevault-desktop/src-tauri/src/auth.rs | head -10
```

Locate the function that, after a successful PKCE exchange, saves to keychain and resolves the username. Add (typically just before the function returns success):

```rust
crate::settings_window::emit_state_changed(app);
```

If `app: &AppHandle` isn't already a parameter of the function, plumb it through from the caller (likely `tray::spawn_sign_in`). The PKCE exchange is in `auth::run_sign_in` or similar.

- [ ] **Step 4: Update `auth::sign_out` to take an AppHandle and emit**

Today: `pub fn sign_out(vault_url: &str) { ... }`.

Change signature to:

```rust
pub fn sign_out(vault_url: &str, app: &tauri::AppHandle) {
    // existing body
    let _ = crate::keychain::delete();
    crate::settings_window::emit_state_changed(app);
}
```

(Add the `app` param at the end and call `emit_state_changed` after the keychain delete.)

Update both call sites:

- `src-tauri/src/tray.rs` `spawn_sign_out`: `crate::auth::sign_out(&vault_url, &app);`
- `src-tauri/src/settings_window.rs` `sign_out` command (Task 9): same.

- [ ] **Step 5: Verify it compiles + existing tests pass**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
cargo test 2>&1 | tail -10
```

Expected: clean `Finished`. All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/pipeline.rs src-tauri/src/auth.rs src-tauri/src/tray.rs src-tauri/src/settings_window.rs
git commit -m "feat: emit settings:state-changed on pause/sign-in/sign-out"
```

---

## Task 11: Settings HTML (`ui/settings.html`)

**Files:**
- Modify: `ui/settings.html` (replace placeholder)

- [ ] **Step 1: Write the full HTML**

Replace the contents of `/root/vorevault-desktop/ui/settings.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self';">
  <title>VoreVault</title>
  <link rel="stylesheet" href="settings.css">
</head>
<body>
  <main id="root" aria-live="polite">
    <h1 class="display-title">settings</h1>
    <p class="subtitle" id="vault-host">vault.bullmoosefn.com</p>

    <section class="rows" id="rows">
      <div class="row" id="row-account">
        <span class="row-label">account</span>
        <span class="row-control" id="ctrl-account"></span>
      </div>
      <div class="row" id="row-folder">
        <span class="row-label">watch folder</span>
        <span class="row-control" id="ctrl-folder"></span>
      </div>
      <div class="row" id="row-autostart">
        <span class="row-label">launch at login</span>
        <span class="row-control" id="ctrl-autostart"></span>
      </div>
      <div class="row" id="row-version">
        <span class="row-label">version</span>
        <span class="row-control mono" id="ctrl-version"></span>
      </div>
    </section>

    <footer class="footer">
      <span>self-hosted clip vault</span>
      <a id="report-issue" href="#" target="_blank" rel="noopener">report an issue ↗</a>
    </footer>
  </main>
  <script src="settings.js"></script>
</body>
</html>
```

- [ ] **Step 2: Build**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```

Expected: clean `Finished`. (Window won't be functional yet without JS + CSS — Tasks 12, 13.)

- [ ] **Step 3: Commit**

```bash
git add ui/settings.html
git commit -m "feat(ui): settings.html — semantic markup with row containers + footer"
```

---

## Task 12: Settings CSS (`ui/settings.css`) + bundled fonts

**Files:**
- Create: `ui/settings.css`
- Create: `ui/fonts/Fraunces-VariableFont.woff2`
- Create: `ui/fonts/Inter-VariableFont.woff2`
- Create: `ui/fonts/JetBrainsMono-VariableFont.woff2`

- [ ] **Step 1: Download the three webfonts as woff2 (variable-font versions)**

```bash
cd /root/vorevault-desktop
mkdir -p ui/fonts
# Fraunces (Google Fonts variable, italic axis)
curl -sL -o ui/fonts/Fraunces-VariableFont.woff2 \
  "https://fonts.gstatic.com/s/fraunces/v32/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk.woff2"
# Inter
curl -sL -o ui/fonts/Inter-VariableFont.woff2 \
  "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2"
# JetBrains Mono
curl -sL -o ui/fonts/JetBrainsMono-VariableFont.woff2 \
  "https://fonts.gstatic.com/s/jetbrainsmono/v20/tDbY2o-flEEny0FZhsfKu5WU4xD-IQ-PuZJJXxfpAO_BDqI.woff2"
ls -la ui/fonts/
```

Expected: 3 files, each between 30–80 KB.

(If Google Fonts URLs change, fall back to `npm pack @fontsource/fraunces` etc., or convert any TTF via [woff2.fontsquirrel.com].)

- [ ] **Step 2: Write the CSS**

Create `ui/settings.css`:

```css
/* Hand-ported design tokens from VoreVault web (vault.bullmoosefn.com).
   See vorevault repo: app/src/app/globals.css and design-system/MASTER.md. */

@font-face {
  font-family: "Fraunces";
  src: url("fonts/Fraunces-VariableFont.woff2") format("woff2");
  font-weight: 100 900;
  font-style: italic;
  font-display: block;
}
@font-face {
  font-family: "Inter";
  src: url("fonts/Inter-VariableFont.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: block;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("fonts/JetBrainsMono-VariableFont.woff2") format("woff2");
  font-weight: 100 800;
  font-style: normal;
  font-display: block;
}

:root {
  --vv-cream: #fdfbf6;
  --vv-cream-2: #f4ede0;
  --vv-cream-3: #fff8e8;
  --vv-ink: #1a1a1a;
  --vv-muted: #555;
  --vv-faint: #777;
  --vv-dashed: #c4b69e;
  --vv-danger: #fde4e4;
  --vv-danger-ink: #b34a3a;
  --vv-go: #d8efd2;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--vv-cream);
  color: var(--vv-ink);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  user-select: none;
  -webkit-user-select: none;
}

main { padding: 22px 26px 18px; }

.display-title {
  font-family: "Fraunces", Georgia, serif;
  font-style: italic;
  font-weight: 400;
  font-size: 26px;
  line-height: 1;
  margin: 0 0 2px;
}

.subtitle {
  font-size: 11px;
  color: var(--vv-faint);
  margin: 0 0 16px;
  text-transform: lowercase;
}

.rows { margin-bottom: 6px; }

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px dashed var(--vv-dashed);
  font-size: 13px;
}
.row:last-child { border-bottom: none; }
.row.disabled .row-label,
.row.disabled .row-control { opacity: 0.4; }

.row-label { color: var(--vv-ink); }

.row-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--vv-muted);
  font-size: 12px;
}
.row-control.mono { font-family: "JetBrains Mono", ui-monospace, monospace; }

.btn {
  border: 1.5px solid var(--vv-ink);
  background: var(--vv-cream-3);
  box-shadow: 2px 2px 0 var(--vv-ink);
  padding: 4px 10px;
  border-radius: 3px;
  font-size: 12px;
  font-family: inherit;
  color: var(--vv-ink);
  cursor: pointer;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.btn:hover { background: var(--vv-cream-2); }
.btn:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 var(--vv-ink); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: 2px 2px 0 var(--vv-ink); }
.btn-danger { background: var(--vv-danger); }
.btn-go { background: var(--vv-go); }

.btn-warn {
  color: var(--vv-danger-ink);
  font-style: italic;
}

.username {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  color: var(--vv-muted);
}

.error-banner {
  padding: 24px;
  color: var(--vv-danger-ink);
  font-style: italic;
}

.inline-error {
  color: var(--vv-danger-ink);
  font-style: italic;
  font-size: 11px;
}

.signed-out-text {
  color: var(--vv-faint);
}

.footer {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--vv-dashed);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--vv-faint);
}
.footer a {
  color: var(--vv-danger-ink);
  text-decoration: underline;
  cursor: pointer;
}
```

- [ ] **Step 3: Verify the build still works**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```

Expected: clean `Finished`.

- [ ] **Step 4: Commit**

```bash
git add ui/settings.css ui/fonts/
git commit -m "feat(ui): settings.css — VoreVault brand tokens + bundled fonts"
```

---

## Task 13: Settings JS (`ui/settings.js`)

**Files:**
- Create: `ui/settings.js`

**Security note:** All DOM mutation uses `textContent`, `replaceChildren`, and `createElement` — never `innerHTML` — to prevent XSS via maliciously-crafted state values (e.g., a server-supplied username containing markup).

- [ ] **Step 1: Write the JS bridge**

Create `/root/vorevault-desktop/ui/settings.js`:

```javascript
// Settings window bridge: invoke Tauri commands, listen for state events,
// re-render the whole DOM on each update. Uses window.__TAURI__ globals
// (withGlobalTauri = true in tauri.conf.json).

const { core: tCore, event: tEvent, opener: tOpener, dialog: tDialog } = window.__TAURI__;

const REPORT_URL = "https://github.com/Bullmoose-Code/vorevault-desktop/issues/new";

let autostartEnabled = false;
let signedIn = false;

async function loadAndRender() {
  let state, autostart;
  try {
    state = await tCore.invoke("get_state");
  } catch (e) {
    console.error("get_state failed", e);
    renderError();
    return;
  }
  try {
    autostart = await tCore.invoke("get_autostart");
  } catch (e) {
    console.warn("get_autostart failed", e);
    autostart = false;
  }
  autostartEnabled = !!autostart;
  signedIn = !!state.username;
  render(state);
}

function render(state) {
  renderAccount(state);
  renderFolder(state);
  renderAutostart();
  renderVersion(state);
}

function renderAccount(state) {
  const acct = document.getElementById("ctrl-account");
  acct.replaceChildren();
  if (state.username) {
    const name = document.createElement("span");
    name.className = "username";
    name.textContent = "@" + state.username;
    acct.appendChild(name);
    acct.appendChild(mkBtn("sign out", "btn btn-danger", onSignOut));
  } else {
    const txt = document.createElement("span");
    txt.className = "signed-out-text";
    txt.textContent = "not signed in";
    acct.appendChild(txt);
    acct.appendChild(mkBtn("sign in with Discord", "btn", onSignIn));
  }
}

function renderFolder(state) {
  const folder = document.getElementById("ctrl-folder");
  const row = document.getElementById("row-folder");
  folder.replaceChildren();
  if (!signedIn) {
    row.classList.add("disabled");
    const btn = mkBtn("—", "btn", null);
    btn.disabled = true;
    folder.appendChild(btn);
    return;
  }
  row.classList.remove("disabled");
  if (state.watch_folder_label) {
    const btn = mkBtn(state.watch_folder_label, "btn", onPickFolder);
    btn.title = state.watch_folder; // full path on hover
    folder.appendChild(btn);
  } else {
    folder.appendChild(mkBtn("choose a folder…", "btn btn-warn", onPickFolder));
  }
}

function renderAutostart() {
  const auto = document.getElementById("ctrl-autostart");
  const row = document.getElementById("row-autostart");
  auto.replaceChildren();
  if (!signedIn) {
    row.classList.add("disabled");
    const btn = mkBtn("—", "btn", null);
    btn.disabled = true;
    auto.appendChild(btn);
    return;
  }
  row.classList.remove("disabled");
  const btn = mkBtn(
    autostartEnabled ? "on" : "off",
    autostartEnabled ? "btn btn-go" : "btn",
    onToggleAutostart
  );
  auto.appendChild(btn);
}

function renderVersion(state) {
  document.getElementById("ctrl-version").textContent = "v" + state.version;
}

function renderError() {
  const root = document.getElementById("root");
  root.replaceChildren();
  const div = document.createElement("div");
  div.className = "error-banner";
  div.textContent = "VoreVault — couldn't load settings, please reopen.";
  root.appendChild(div);
}

function mkBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

async function onSignIn() {
  try { await tCore.invoke("sign_in"); }
  catch (e) { console.error(e); }
}

async function onSignOut() {
  try { await tCore.invoke("sign_out"); }
  catch (e) { console.error(e); }
}

async function onPickFolder() {
  const picked = await tDialog.open({ directory: true, multiple: false });
  if (!picked) return;
  try {
    await tCore.invoke("change_watch_folder", { path: picked });
  } catch (e) {
    showFolderError(typeof e === "string" ? e : "couldn't change folder");
  }
}

function showFolderError(msg) {
  const folder = document.getElementById("ctrl-folder");
  const existing = folder.querySelector(".inline-error");
  if (existing) existing.remove();
  const err = document.createElement("span");
  err.className = "inline-error";
  err.textContent = msg;
  folder.appendChild(err);
}

async function onToggleAutostart() {
  const next = !autostartEnabled;
  try {
    await tCore.invoke("set_autostart", { enabled: next });
    autostartEnabled = next;
  } catch (e) {
    console.warn("set_autostart failed", e);
    try { autostartEnabled = await tCore.invoke("get_autostart"); }
    catch (_) {}
  }
  await loadAndRender();
}

document.getElementById("report-issue").addEventListener("click", async (e) => {
  e.preventDefault();
  try { await tOpener.openUrl(REPORT_URL); }
  catch (err) { console.warn("openUrl failed", err); }
});

// Re-render on backend state pushes.
tEvent.listen("settings:state-changed", (evt) => {
  signedIn = !!evt.payload.username;
  render(evt.payload);
});

// Initial paint.
loadAndRender();
```

- [ ] **Step 2: Verify the build is still clean**

```bash
cd /root/vorevault-desktop
cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```

Expected: clean `Finished`.

- [ ] **Step 3: Commit**

```bash
git add ui/settings.js
git commit -m "feat(ui): settings.js — invoke commands, listen for state, safe DOM construction"
```

---

## Task 14: Tray menu reorganization

**Files:**
- Modify: `src-tauri/src/tray.rs` (`build_menu`, `handle_menu_event`)

- [ ] **Step 1: Update `build_menu` for the signed-in branch**

In `src-tauri/src/tray.rs`, find the `fn build_menu(...)` function (around line 66). Locate the signed-in branch (the `match` arm that produces items including `pick`, `signout`, `toggle-notifications`).

Read the current state of paused once at the top of this branch:

```rust
            let is_paused = crate::tray::PIPELINE
                .read()
                .unwrap()
                .as_ref()
                .map(|p| p.is_paused())
                .unwrap_or(false);
```

**Remove** the `pick` and `signout` MenuItem creations in this branch, and remove their entries from the `items` vec.

**Add** these new MenuItem creations:

```rust
            let open_settings = MenuItem::with_id(app, "open-settings", "Open VoreVault…", true, None::<&str>)?;

            let pause_label = if is_paused { "Pause uploads  ✓" } else { "Pause uploads" };
            let pause_item = MenuItem::with_id(app, "toggle-pause", pause_label, true, None::<&str>)?;

            let paused_row = if is_paused {
                Some(MenuItem::with_id(app, "paused-status", "⏸ Paused", false, None::<&str>)?)
            } else {
                None
            };
```

In the `items.push(...)` sequence, push items in this order:
1. `signed_in` (status, disabled — already exists)
2. `watching` (status, disabled — already exists)
3. `paused_row` (if Some)
4. `uploading_status` (if Some — already exists)
5. separator
6. `toggle_notifications` (already exists)
7. `pause_item` (NEW)
8. separator
9. `open_settings` (NEW)
10. separator
11. `quit`

(Remove the old `pick` and `signout` from the items vec — they no longer appear.)

- [ ] **Step 2: Add menu event handlers for the new IDs**

Find `fn handle_menu_event(...)` (around line 173). Add these arms to the match (before the `_ => {}` catchall):

```rust
        "open-settings" => {
            crate::settings_window::show(app);
        }
        "toggle-pause" => {
            let new_paused;
            {
                let guard = crate::tray::PIPELINE.read().unwrap();
                if let Some(pipeline) = guard.as_ref() {
                    new_paused = !pipeline.is_paused();
                    pipeline.set_paused(new_paused);
                } else {
                    return;
                }
            }
            let vault_url = crate::auth::vault_url_from_env();
            refresh_menu(app, &vault_url);
            log::info!("pipeline {} via tray", if new_paused { "paused" } else { "resumed" });
        }
```

Remove the old arms for `"pick-folder"` and `"sign-out"` and delete the helper functions `spawn_pick_folder`, `spawn_sign_out`, and `do_pick_folder` if they have no remaining callers (`grep -n "spawn_pick_folder\|spawn_sign_out\|do_pick_folder" src-tauri/src/` to confirm).

- [ ] **Step 3: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished`. Warnings about removed unused imports may need cleanup.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/tray.rs
git commit -m "feat(tray): hybrid menu — Open VoreVault…, Pause uploads, paused status row"
```

---

## Task 15: Wire `show_first_run` + `install_close_handler` in main.rs

**Files:**
- Modify: `src-tauri/src/main.rs` (call `install_close_handler` in setup; replace post-auth folder dialog with `show_first_run`)

- [ ] **Step 1: Install the close handler at app start**

In `src-tauri/src/main.rs`, inside the `.setup(|app| { ... })` block, after `tray::install(&handle)?;`, add:

```rust
            crate::settings_window::install_close_handler(&handle);
```

- [ ] **Step 2: Find the post-auth folder dialog from Sub-project C**

```bash
grep -rn "do_pick_folder\|first.run\|after.*sign.in.*folder\|pick_folder" /root/vorevault-desktop/src-tauri/src/ 2>&1 | head -10
```

Expected: a call site in `tray.rs` (likely in `complete_sign_in` or after the `spawn_sign_in` flow) that invokes a folder-picker on first sign-in when no folder is configured. The exact name from sub-project C commit history is `0629343 feat(tray): start pipeline immediately on pick + auto-prompt folder on first sign-in`.

- [ ] **Step 3: Replace it with `show_first_run`**

At that call site, replace the dialog invocation with:

```rust
crate::settings_window::show_first_run(&app);
```

(Make sure the AppHandle is in scope. Pass it through if needed.)

- [ ] **Step 4: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished`.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/main.rs src-tauri/src/auth.rs src-tauri/src/tray.rs
git commit -m "feat(main): show_first_run replaces post-auth folder dialog; install close handler"
```

---

## Task 16: Version bump + final manual test pass

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Bump version to 0.4.0**

In `src-tauri/Cargo.toml`, find the `[package]` block:

```toml
version = "0.3.0"
```

Change to:

```toml
version = "0.4.0"
```

In `src-tauri/tauri.conf.json`:

```json
"version": "0.3.0",
```

Change to:

```json
"version": "0.4.0",
```

- [ ] **Step 2: Build a release binary**

```bash
cd /root/vorevault-desktop
cargo build --release --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```

Expected: `Finished \`release\` profile`.

- [ ] **Step 3: Run the manual test plan**

Run through each item in this checklist (which will go in the PR description):

```
[ ] Cold start, never signed in:
    - tray menu shows "Sign in with Discord", "Quit"
    - settings window does NOT auto-open
[ ] Sign in for the first time:
    - settings window auto-opens, centered
    - account row shows "@<username>"
    - watch folder row shows "choose a folder…" italic
[ ] Pick a folder from the window:
    - watcher starts, tray menu updates
    - drop a file → it uploads + tray toast appears
[ ] Reopen settings window via tray "Open VoreVault…":
    - shows current state correctly
[ ] Change watch folder while uploads in flight:
    - in-flight finish, watcher swaps, no duplicate uploads
[ ] Toggle "launch at login":
    - quit + relaunch (manual: log out / reboot to verify on macOS,
      or check Task Scheduler on Windows)
[ ] Toggle "Pause uploads" in tray:
    - new files queue but don't upload
    - tray status row shows "⏸ Paused"
    - resume → drain → notification toast fires
[ ] Sign out from window:
    - watcher stops, window shows signed-out empty state
    - tray menu shows "Sign in with Discord"
[ ] Close window via X:
    - window hides, app keeps running
    - reopen via tray → instant (window survived)
[ ] First-run aborted (close window without picking folder):
    - app dormant, tray says "Watching: not set"
    - reopen window via tray → can pick folder
[ ] Test on both macOS and Windows for autostart correctness
```

Fix any issues found and add follow-up commits as needed.

- [ ] **Step 4: Commit the version bump**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: bump to v0.4.0 — settings window + pause uploads"
```

- [ ] **Step 5: Push the branch and open a PR**

Build the PR body in a temp file (avoids quoting headaches):

```bash
cd /root/vorevault-desktop
git push -u origin feat/settings-window
cat > /tmp/pr-body.md <<'EOF'
Implements Sub-project D of Theme 1.1. Spec: vorevault repo at `docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-d-design.md`. Plan: vorevault repo at `docs/superpowers/plans/2026-04-26-desktop-watcher-subproject-d.md`.

## Summary

- New brand-styled settings window (480×420, Fraunces/Inter/sticker shadows): change watch folder, sign out, launch-at-login, version.
- New tray toggle: "Pause uploads" (soft pause, in-flight uploads finish, non-persistent).
- Tray reorganization: Open VoreVault… replaces Pick folder…; Sign out migrates into the window; new ⏸ Paused status row.
- First-run flow now opens the settings window (instead of a native folder dialog) after the user signs in.
- New plugin: `tauri-plugin-autostart`.

## Test plan

[Paste the manual checklist from Task 16 Step 3 here.]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
gh pr create --title "feat: settings window + pause uploads (Sub-project D, v0.4.0)" --body-file /tmp/pr-body.md
```

Expected: PR URL printed.

---

## Self-review checklist (run after writing the plan)

- [x] **Spec coverage:**
  - Goal — covered by Tasks 4-15
  - Non-goals — none of the deferred items have tasks (correct)
  - Architecture: settings_window.rs (Tasks 4-7, 9, 10), pipeline.rs pause (Tasks 2-3, 10), tray.rs (Tasks 8 [refactor], 14), auth.rs sign-out emit (Task 10), main.rs (Task 15), src-tauri/ui/ (Tasks 11-13), tauri-plugin-autostart (Task 1)
  - Window layout — Tasks 11, 12, 13
  - Tray menu reorganization — Task 14
  - Pause uploads — Tasks 2, 3, 10
  - Data flow — covered by Tasks 7, 9, 10
  - First-run flow — Task 15
  - Error handling — covered inline in command implementations (Task 9) and JS (Task 13)
  - Testing — pure tests in Tasks 2, 4, 5; manual test plan in Task 16

- [x] **Placeholder scan:** None of the "TBD/TODO/Add appropriate" patterns are present. Each step shows actual code or actual commands.

- [x] **Type consistency:** `SettingsState` fields match across Task 4 (definition), Task 5 (build_state, current_state, emit_state_changed), Task 7 (get_state command), Task 13 (JS render — `state.username`, `state.watch_folder_label`, `state.watch_folder`, `state.version`). `PauseGate` API is consistent across Tasks 2, 3, 10. `Pipeline::set_paused` / `is_paused` consistent across Tasks 3, 10, 14. `tray::PIPELINE.read().unwrap().as_ref()` pattern consistent after Task 8.

- [x] **Risky areas flagged:** Task 5 flags the `username` source (may need `PipelineState.username` field added). Task 8 isolates the `OnceLock` → `RwLock` refactor as its own commit. Task 13 calls out the no-`innerHTML` rule explicitly.
