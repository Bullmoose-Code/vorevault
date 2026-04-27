# Desktop Watcher — Sub-project E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship vorevault-desktop **v0.5.0** — the bootstrapping release that makes the app installable by friends without `cargo build`. Adds GitHub Actions release workflow, `tauri-plugin-updater` integration with silent-on-launch + manual button UX, and a new "Updates" row in the settings window.

**Architecture:** A new `release.yml` GitHub Actions workflow triggers on `v*` tag pushes and uses `tauri-apps/tauri-action@v0` to build, bundle (`.msi` / universal `.dmg`), sign, and publish a GitHub Release. A new `tauri-plugin-updater` is integrated into the app, with a thin `updater.rs` Rust wrapper that owns the state machine (`Idle / Checking / DownloadingUpdate / Ready / Error`) and emits `updater:state-changed` events. Settings window gains an Updates row that subscribes to those events. Updates download silently in the background; install happens on next quit/relaunch — no in-session popups. The `vorevault-desktop` repo was flipped to public during E's brainstorm so the updater can fetch release assets anonymously.

**Tech Stack:** Tauri 2 (Rust + WebView), `tauri-plugin-updater` (new), `tauri-apps/tauri-action@v0` (CI), plain HTML/CSS/JS for the settings window row. Implementation happens in **`/root/vorevault-desktop`** on a new branch `feat/installers-releases`. The spec lives in this repo (`/root/vorevault`); commits to it (this plan, the spec) stay on `spec/desktop-watcher-e`.

**Spec:** `docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-e-design.md`

---

## Pre-task setup

- [ ] **Step 1: Create the implementation branch in vorevault-desktop**

```bash
cd /root/vorevault-desktop
git fetch origin
git checkout -b feat/installers-releases origin/main
```

Expected: switched to a new branch tracking `origin/main`. Working tree clean.

- [ ] **Step 2: Confirm baseline build still works**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in ...`. No errors.

---

## ⚠ Manual operations Ryan must complete before Task 7

These cannot be done by an automated implementer. Pause subagent execution after Task 6 and confirm Ryan has done all three before continuing.

**M1. Generate the updater keypair (LOCAL machine, NOT in CI):**

```bash
cargo install tauri-cli --locked
mkdir -p ~/.tauri
cargo tauri signer generate -w ~/.tauri/vorevault-updater.key
# When prompted, set a passphrase. SAVE IT.
```

Outputs:
- `~/.tauri/vorevault-updater.key` — base64 private key (password-protected)
- `~/.tauri/vorevault-updater.key.pub` — base64 public key (paste into Task 9)

**M2. Store the secrets:**
- 1Password: file `~/.tauri/vorevault-updater.key` + the passphrase (separate items).
- Offline backup of the key file to a USB drive or second machine.

**M3. Add the GH Actions secrets:**

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Bullmoose-Code/vorevault-desktop < ~/.tauri/vorevault-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo Bullmoose-Code/vorevault-desktop
# Paste the passphrase when prompted.
```

Verify:
```bash
gh secret list --repo Bullmoose-Code/vorevault-desktop
```
Expected: both secrets appear in the list.

**Once M1–M3 are done, the implementer can proceed to Task 8 with the public key value in hand.**

---

## Task 1: Add `tauri-plugin-updater` dependency + register the plugin

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs:21-29` (plugin registration block)

- [ ] **Step 1: Add the plugin to Cargo.toml**

Open `src-tauri/Cargo.toml`. Find the existing block of `tauri-plugin-*` lines (the last one is `tauri-plugin-autostart = "2"`). Add this line below it:

```toml
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Register the plugin in main.rs**

Open `src-tauri/src/main.rs`. Find the `tauri::Builder::default()` block starting around line 21. After the `tauri_plugin_autostart::init(...)` plugin line (ends at line 28, `))`), insert one new plugin line before the `.invoke_handler(...)` call:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

The block should now look like:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ))
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
```

- [ ] **Step 3: Verify dep resolves and compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: `Compiling tauri-plugin-updater v2.x.x` appears, then a clean `Finished` line. No errors.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs
git commit -m "chore(deps): add tauri-plugin-updater + register"
```

---

## Task 2: Create `updater` module skeleton with state enum

**Files:**
- Create: `src-tauri/src/updater.rs`
- Modify: `src-tauri/src/main.rs:4-13` (add `mod updater;`)

This task creates the module file with the public `UpdaterState` enum and a couple of pure-logic helper tests. No Tauri runtime usage yet — those land in Tasks 3 and 4.

- [ ] **Step 1: Create the module file**

Create `src-tauri/src/updater.rs` with this content:

```rust
//! Auto-updater state machine + Tauri commands + startup check task.
//! Sub-project E of Theme 1.1. See
//! docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-e-design.md.

use serde::Serialize;

/// Single source of truth pushed to the settings window's JS layer on every
/// updater state change. JS re-renders the Updates row on each event.
///
/// The variants intentionally don't enforce transitions — any state can flow
/// to any other state. Callers are expected to follow the natural sequence:
/// Idle → Checking → (UpToDate | DownloadingUpdate(v) → Ready(v) | Error(msg)).
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "value")]
pub enum UpdaterState {
    /// Initial state on app launch, before any check has happened.
    Idle,
    /// A check is in flight (manual button click or startup task).
    Checking,
    /// Last check completed; current binary is the latest published release.
    UpToDate,
    /// Newer version found; installer downloading in background.
    /// Holds the target version string.
    DownloadingUpdate(String),
    /// Update fully downloaded and staged; restart applies it.
    /// Holds the target version string.
    Ready(String),
    /// Last check or download failed; holds a short user-facing message.
    Error(String),
}

impl UpdaterState {
    /// Render a status string for the Updates row in the settings window.
    /// `current` is the running app's version (e.g., `env!("CARGO_PKG_VERSION")`).
    pub fn status_text(&self, current: &str) -> String {
        match self {
            UpdaterState::Idle | UpdaterState::UpToDate => format!("up to date · v{}", current),
            UpdaterState::Checking => "checking…".to_string(),
            UpdaterState::DownloadingUpdate(v) => format!("downloading v{} in background", v),
            UpdaterState::Ready(v) => format!("update v{} ready — restart to apply", v),
            UpdaterState::Error(msg) => format!("couldn't check ({}) · retry", msg),
        }
    }

    /// True when the user can click "Check now" (no in-flight operation).
    pub fn check_button_enabled(&self) -> bool {
        matches!(
            self,
            UpdaterState::Idle | UpdaterState::UpToDate | UpdaterState::Error(_)
        )
    }

    /// True when "Restart now" should be shown.
    pub fn restart_button_visible(&self) -> bool {
        matches!(self, UpdaterState::Ready(_))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_text_idle_shows_current_version() {
        assert_eq!(UpdaterState::Idle.status_text("0.5.0"), "up to date · v0.5.0");
    }

    #[test]
    fn status_text_uptodate_matches_idle() {
        assert_eq!(
            UpdaterState::UpToDate.status_text("0.5.0"),
            UpdaterState::Idle.status_text("0.5.0"),
        );
    }

    #[test]
    fn status_text_ready_shows_target_version() {
        assert_eq!(
            UpdaterState::Ready("0.5.1".to_string()).status_text("0.5.0"),
            "update v0.5.1 ready — restart to apply",
        );
    }

    #[test]
    fn status_text_error_includes_message() {
        let s = UpdaterState::Error("network unreachable".to_string()).status_text("0.5.0");
        assert!(s.contains("network unreachable"));
        assert!(s.starts_with("couldn't check"));
    }

    #[test]
    fn check_button_enabled_only_in_terminal_states() {
        assert!(UpdaterState::Idle.check_button_enabled());
        assert!(UpdaterState::UpToDate.check_button_enabled());
        assert!(UpdaterState::Error("x".into()).check_button_enabled());
        assert!(!UpdaterState::Checking.check_button_enabled());
        assert!(!UpdaterState::DownloadingUpdate("0.5.1".into()).check_button_enabled());
        assert!(!UpdaterState::Ready("0.5.1".into()).check_button_enabled());
    }

    #[test]
    fn restart_visible_only_when_ready() {
        assert!(UpdaterState::Ready("0.5.1".into()).restart_button_visible());
        assert!(!UpdaterState::Idle.restart_button_visible());
        assert!(!UpdaterState::Checking.restart_button_visible());
        assert!(!UpdaterState::Error("x".into()).restart_button_visible());
    }

    #[test]
    fn state_serializes_with_tagged_envelope() {
        let s = serde_json::to_string(&UpdaterState::DownloadingUpdate("0.5.1".into())).unwrap();
        assert!(s.contains("\"kind\":\"DownloadingUpdate\""));
        assert!(s.contains("\"value\":\"0.5.1\""));
    }
}
```

- [ ] **Step 2: Register the module in main.rs**

Open `src-tauri/src/main.rs`. Find the `mod` declaration block at lines 4-13. Add `mod updater;` to keep the alphabetical-ish order (it goes between `mod tray;` and `mod uploader;`):

```rust
mod auth;
mod config;
mod db;
mod keychain;
mod notifier;
mod pipeline;
mod settings_window;
mod tray;
mod updater;
mod uploader;
mod watcher;
```

- [ ] **Step 3: Run the tests**

```bash
cd /root/vorevault-desktop/src-tauri
cargo test --lib updater:: 2>&1 | tail -15
```

Expected: 7 tests pass (all from `updater::tests::`).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/updater.rs src-tauri/src/main.rs
git commit -m "feat(updater): state enum + status formatters with unit tests"
```

---

## Task 3: Shared updater state in a `RwLock<UpdaterState>`

**Files:**
- Modify: `src-tauri/src/updater.rs` (add module-level `STATE` + helpers)

This task adds the shared in-memory state cell that both the startup task (Task 5) and the Tauri commands (Task 4) will read/write. State changes emit `updater:state-changed` events.

- [ ] **Step 1: Add the static state + helper functions**

Open `src-tauri/src/updater.rs`. After the `impl UpdaterState { ... }` block but before `#[cfg(test)] mod tests`, insert:

```rust
use std::sync::RwLock;
use tauri::{AppHandle, Emitter};

/// Process-wide updater state cell. Startup task and the 3 Tauri commands
/// all read/write through this. Lock contention is negligible (transitions
/// are infrequent and the lock is held for microseconds).
static STATE: RwLock<UpdaterState> = RwLock::new(UpdaterState::Idle);

/// Read the current state (snapshot).
pub fn snapshot() -> UpdaterState {
    STATE.read().expect("updater STATE lock poisoned").clone()
}

/// Replace the state and emit `updater:state-changed` to all webviews.
/// All transitions go through this so JS always sees changes.
pub fn set_state(app: &AppHandle, new_state: UpdaterState) {
    {
        let mut guard = STATE.write().expect("updater STATE lock poisoned");
        *guard = new_state.clone();
    }
    if let Err(e) = app.emit("updater:state-changed", &new_state) {
        log::warn!("updater: failed to emit state-changed event: {}", e);
    }
}
```

- [ ] **Step 2: Verify it compiles (no new tests yet — these helpers need an AppHandle)**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: clean `Finished` line.

- [ ] **Step 3: Verify existing tests still pass**

```bash
cargo test --lib updater:: 2>&1 | tail -10
```

Expected: 7 tests pass (same as Task 2).

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/updater.rs
git commit -m "feat(updater): shared RwLock<UpdaterState> + emit helper"
```

---

## Task 4: Three Tauri commands — `updater_get_state`, `updater_check_now`, `updater_install_and_restart`

**Files:**
- Modify: `src-tauri/src/updater.rs` (add 3 `#[tauri::command]` functions + check helper)
- Modify: `src-tauri/src/main.rs:29-36` (register commands in `invoke_handler`)

- [ ] **Step 1: Add the 3 commands and a shared check helper to updater.rs**

The command names are prefixed with `updater_` so they don't collide with `settings_window::get_state` in the global Tauri command namespace.

Open `src-tauri/src/updater.rs`. After the `set_state` function but before `#[cfg(test)] mod tests`, insert:

```rust
use tauri_plugin_updater::UpdaterExt;

/// Internal helper: run one updater check, transition state through the cycle.
/// Used by both the manual `updater_check_now` command and the startup task.
async fn run_check(app: AppHandle) {
    set_state(&app, UpdaterState::Checking);

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::error!("updater: handle unavailable: {}", e);
            set_state(&app, UpdaterState::Error("plugin unavailable".to_string()));
            return;
        }
    };

    let maybe_update = match updater.check().await {
        Ok(u) => u,
        Err(e) => {
            log::warn!("updater: check failed: {}", e);
            set_state(&app, UpdaterState::Error(format!("{}", e)));
            return;
        }
    };

    let Some(update) = maybe_update else {
        set_state(&app, UpdaterState::UpToDate);
        return;
    };

    let target_version = update.version.clone();
    log::info!("updater: downloading v{}", target_version);
    set_state(&app, UpdaterState::DownloadingUpdate(target_version.clone()));

    // download_and_install stages the new installer; the actual swap happens
    // when the app exits (Tauri plugin handles per-platform install on quit).
    let result = update
        .download_and_install(|_chunk, _total| {}, || {})
        .await;

    match result {
        Ok(()) => {
            log::info!("updater: v{} downloaded and staged", target_version);
            set_state(&app, UpdaterState::Ready(target_version));
        }
        Err(e) => {
            log::warn!("updater: download/install failed: {}", e);
            set_state(&app, UpdaterState::Error(format!("download failed: {}", e)));
        }
    }
}

/// Get current state. Settings window calls this on open to render initial UI.
#[tauri::command]
pub fn updater_get_state() -> UpdaterState {
    snapshot()
}

/// Manually trigger a check. Settings window's "Check now" button calls this.
#[tauri::command]
pub async fn updater_check_now(app: AppHandle) {
    run_check(app).await;
}

/// Restart the app to apply a staged update.
/// Only meaningful when state is `Ready(_)`; safe to call in other states.
#[tauri::command]
pub fn updater_install_and_restart(app: AppHandle) {
    log::info!("updater: restart requested");
    app.restart();
}

/// Spawn the post-startup check. Called from main.rs setup.
/// Sleeps 5s on a worker thread (no tokio direct dep needed) and then runs
/// one async check via `block_on` on that thread.
pub fn spawn_startup_check(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        log::info!("updater: running startup check");
        tauri::async_runtime::block_on(run_check(app));
    });
}
```

- [ ] **Step 2: Register the 3 commands in main.rs**

Open `src-tauri/src/main.rs`. Find the `.invoke_handler(tauri::generate_handler![ ... ])` block (around lines 29-36). Add the 3 new commands at the end of the list:

```rust
.invoke_handler(tauri::generate_handler![
    settings_window::get_state,
    settings_window::get_autostart,
    settings_window::set_autostart,
    settings_window::change_watch_folder,
    settings_window::sign_out,
    settings_window::sign_in,
    updater::updater_get_state,
    updater::updater_check_now,
    updater::updater_install_and_restart,
])
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished` line. If `app.updater()` errors with a missing trait, the `use tauri_plugin_updater::UpdaterExt;` import (added in Step 1) brings it in.

- [ ] **Step 4: Verify existing tests still pass**

```bash
cargo test --lib updater:: 2>&1 | tail -10
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/updater.rs src-tauri/src/main.rs
git commit -m "feat(updater): tauri commands + shared check helper"
```

---

## Task 5: Spawn startup check task in main.rs setup

**Files:**
- Modify: `src-tauri/src/main.rs:37-54` (`.setup(...)` closure)

- [ ] **Step 1: Add the spawn call to the setup closure**

Open `src-tauri/src/main.rs`. Find the `.setup(|app| { ... })` closure (around lines 37-54). After the `crate::settings_window::install_close_handler(&handle);` line (currently line 40), add:

```rust
crate::updater::spawn_startup_check(handle.clone());
```

The closure should now look like:

```rust
.setup(|app| {
    let handle = app.handle().clone();
    tray::install(&handle)?;
    crate::settings_window::install_close_handler(&handle);
    crate::updater::spawn_startup_check(handle.clone());

    std::thread::spawn(move || {
        let vault_url = auth::vault_url_from_env();
        tray::refresh_menu(&handle, &vault_url);

        if let Err(e) = start_pipeline_if_configured(&handle, &vault_url) {
            log::warn!("could not start pipeline: {}", e);
        }

        tray::refresh_menu(&handle, &vault_url);
    });

    Ok(())
})
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: clean `Finished` line.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/src/main.rs
git commit -m "feat(updater): spawn 5s-delayed startup check from setup"
```

---

## Task 6: Capability + permission stubs for the 3 new commands

**Files:**
- Modify: `src-tauri/capabilities/settings.json`
- Create: `src-tauri/permissions/autogenerated/commands/updater_get_state.toml`
- Create: `src-tauri/permissions/autogenerated/commands/updater_check_now.toml`
- Create: `src-tauri/permissions/autogenerated/commands/updater_install_and_restart.toml`

The Tauri 2 permission system requires that every JS-callable `#[tauri::command]` have a permission stub before any capability can reference it.

- [ ] **Step 1: Create the 3 permission stubs**

For each command, create a TOML file at `src-tauri/permissions/autogenerated/commands/<name>.toml` with the standard Tauri-generated shape. Use the existing `set_autostart.toml` (or any other stub already in that directory) as a template.

`src-tauri/permissions/autogenerated/commands/updater_get_state.toml`:
```toml
"$schema" = "../schemas/schema.json"

[[permission]]
identifier = "allow-updater-get-state"
description = "Enables the updater_get_state command without any pre-configured scope."
commands.allow = ["updater_get_state"]

[[permission]]
identifier = "deny-updater-get-state"
description = "Denies the updater_get_state command without any pre-configured scope."
commands.deny = ["updater_get_state"]
```

`src-tauri/permissions/autogenerated/commands/updater_check_now.toml` — same shape, substituting `updater_check_now` and `allow-updater-check-now` / `deny-updater-check-now`.

`src-tauri/permissions/autogenerated/commands/updater_install_and_restart.toml` — same shape, substituting `updater_install_and_restart` and `allow-updater-install-and-restart` / `deny-updater-install-and-restart`.

- [ ] **Step 2: Add the 3 app commands + the updater plugin permission to the capability**

Open `src-tauri/capabilities/settings.json`. The current `permissions` array ends with `"allow-sign-in"`. Add 4 new entries at the end (one plugin perm + 3 app commands):

```json
"permissions": [
    "core:default",
    "core:event:default",
    "core:webview:default",
    "core:window:default",
    "opener:default",
    "dialog:allow-open",
    "notification:default",
    "autostart:allow-enable",
    "autostart:allow-disable",
    "autostart:allow-is-enabled",
    "updater:default",
    "allow-get-state",
    "allow-get-autostart",
    "allow-set-autostart",
    "allow-change-watch-folder",
    "allow-sign-out",
    "allow-sign-in",
    "allow-updater-get-state",
    "allow-updater-check-now",
    "allow-updater-install-and-restart"
]
```

(Keep the order: existing items first, then `updater:default` after the other plugin perms, then the 3 new app commands at the end.)

- [ ] **Step 3: Verify it compiles**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished` line. If you see "unknown permission `allow-updater-get-state`" or similar, the TOML stub is missing or malformed — re-check Step 1.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/capabilities/settings.json src-tauri/permissions/autogenerated/commands/updater_*.toml
git commit -m "feat(updater): capability + permission stubs for 3 commands"
```

---

## ⏸ PAUSE — confirm Manual Operations M1–M3 are complete

Before Task 7, the implementer needs the **public key value** generated in M1. If Ryan hasn't completed M1–M3 yet, stop here and ask him to do so. The pubkey is the contents of `~/.tauri/vorevault-updater.key.pub` — a single base64 line that looks like `dW50cnVzdGVkIGNvbW1lbnQ6...`.

---

## Task 7: Add updater config to `tauri.conf.json` (with REAL pubkey)

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add the `plugins.updater` block**

Open `src-tauri/tauri.conf.json`. There is no `plugins` key yet. Add it as a top-level field, sibling to `app` and `bundle`. The full file should have this structure (showing the new `plugins` block in context):

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "VoreVault",
  "version": "0.4.0",
  "identifier": "fn.bullmoose.vorevault.desktop",
  "build": { "...": "..." },
  "app": { "...": "..." },
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "PASTE_THE_REAL_PUBKEY_FROM_M1_HERE",
      "endpoints": [
        "https://github.com/Bullmoose-Code/vorevault-desktop/releases/latest/download/latest.json"
      ]
    }
  },
  "bundle": { "...": "..." }
}
```

⚠ Replace `PASTE_THE_REAL_PUBKEY_FROM_M1_HERE` with the actual base64 string from Ryan. It will look something like:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDFFNDg5MEM3NkE4MTI3NjEKUldSaEowOXJ4d0RJSGZGZG5XdEx4eXdMRzFYWjN4OG1WNGJaWUNFcXp4eUFvN1lvSWxsK0dyckkK
```

- [ ] **Step 2: Verify it parses + the build still works**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -10
```

Expected: clean `Finished` line. If Tauri complains about the pubkey format, double-check the base64 string is on one line with no surrounding quotes other than the JSON quoting.

- [ ] **Step 3: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): wire plugins.updater config with pubkey + endpoint"
```

---

## Task 8: Settings window — add "Updates" row HTML + CSS

**Files:**
- Modify: `ui/settings.html` (add the new row)
- Modify: `ui/settings.css` (add styles for the new row)

- [ ] **Step 1: Add the row to settings.html**

Open `ui/settings.html`. Find the `<section class="rows" id="rows">` block. After the existing `<div class="row" id="row-version">` block, add a new row:

```html
<div class="row" id="row-updates">
  <span class="row-label">updates</span>
  <span class="row-control" id="ctrl-updates"></span>
</div>
```

The full `rows` section becomes:

```html
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
  <div class="row" id="row-updates">
    <span class="row-label">updates</span>
    <span class="row-control" id="ctrl-updates"></span>
  </div>
</section>
```

- [ ] **Step 2: Add styles to settings.css for the updates row**

Open `ui/settings.css`. At the bottom of the file, append:

```css
/* Updates row — Sub-project E */
.updates-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--vv-ink-60, #4a4a4a);
}

.updates-status.error {
  color: var(--vv-danger, #b04040);
}

.updates-buttons {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
}

#ctrl-updates {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
```

(If the file uses different token names than `--vv-ink-60` / `--vv-danger`, swap to the closest matching tokens already in the file. Check with `grep -E '^\s*--vv' ui/settings.css | head` first.)

- [ ] **Step 3: Build + verify the bundle includes the new row**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: clean `Finished`. The bundled HTML now contains the updates row.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add ui/settings.html ui/settings.css
git commit -m "feat(ui): add Updates row to settings window (HTML + CSS)"
```

---

## Task 9: Settings window — JS render + handlers + event subscription

**Files:**
- Modify: `ui/settings.js` (add updater render fn, handlers, event listener, initial fetch)

The existing `loadAndRender()` fetches `get_state` + `get_autostart`. Extend it to also fetch `updater_get_state`. Add a `renderUpdates(updaterState)` function. Wire button click handlers. Subscribe to `updater:state-changed` events and re-render on each.

- [ ] **Step 1: Locate the destructuring at the top of settings.js**

Open `ui/settings.js`. The first lines look like:
```js
const { core: tCore, event: tEvent, opener: tOpener, dialog: tDialog } = window.__TAURI__;
```

No change needed here — `tCore` and `tEvent` already cover what we need.

- [ ] **Step 2: Extend `loadAndRender()` to also fetch updater state**

Find the `async function loadAndRender()` function. Modify the body so that after fetching `state` and `autostart`, it ALSO fetches the updater state and passes all three into `render`:

```js
async function loadAndRender() {
  let state, autostart, updaterState;
  try {
    state = await tCore.invoke("get_state");
  } catch (e) {
    renderError("couldn't load settings: " + (e?.message || e));
    return;
  }
  try {
    autostart = await tCore.invoke("get_autostart");
  } catch (e) {
    autostart = { enabled: false, error: e?.message || String(e) };
  }
  try {
    updaterState = await tCore.invoke("updater_get_state");
  } catch (e) {
    updaterState = { kind: "Error", value: e?.message || String(e) };
  }
  render(state, autostart, updaterState);
}
```

- [ ] **Step 3: Update `render()` to call `renderUpdates`**

Find `function render(state)` (currently ~line 32). Update its signature and body to thread autostart + updaterState through (the existing function may already pass autostart separately — match its style):

```js
function render(state, autostart, updaterState) {
  renderAccount(state);
  renderFolder(state);
  renderAutostart(autostart);
  renderVersion(state);
  renderUpdates(updaterState, state.version);
}
```

(If the existing `render()` doesn't take `autostart` as a parameter and renderAutostart fetches its own — leave that pattern alone and just thread `updaterState` through to `renderUpdates`.)

- [ ] **Step 4: Add `renderUpdates()` and click handlers**

After the existing `renderVersion()` function, append:

```js
function renderUpdates(updaterState, currentVersion) {
  const ctrl = document.getElementById("ctrl-updates");
  if (!ctrl) return;
  ctrl.replaceChildren();

  const status = document.createElement("span");
  status.className = "updates-status";

  const kind = updaterState?.kind || "Idle";
  const value = updaterState?.value || "";

  let statusText;
  let isError = false;
  switch (kind) {
    case "Idle":
    case "UpToDate":
      statusText = `up to date · v${currentVersion}`;
      break;
    case "Checking":
      statusText = "checking…";
      break;
    case "DownloadingUpdate":
      statusText = `downloading v${value} in background`;
      break;
    case "Ready":
      statusText = `update v${value} ready — restart to apply`;
      break;
    case "Error":
      statusText = `couldn't check (${value}) · retry`;
      isError = true;
      break;
    default:
      statusText = `unknown state: ${kind}`;
      isError = true;
  }
  if (isError) status.classList.add("error");
  status.textContent = statusText;
  ctrl.appendChild(status);

  const btnRow = document.createElement("span");
  btnRow.className = "updates-buttons";

  const checkEnabled = kind === "Idle" || kind === "UpToDate" || kind === "Error";
  const restartVisible = kind === "Ready";

  if (!restartVisible) {
    const checkBtn = mkBtn("check now", "brand-btn-secondary", onCheckNow);
    if (!checkEnabled) checkBtn.disabled = true;
    btnRow.appendChild(checkBtn);
  } else {
    const restartBtn = mkBtn("restart now", "brand-btn-primary", onRestartNow);
    btnRow.appendChild(restartBtn);
  }
  ctrl.appendChild(btnRow);
}

async function onCheckNow() {
  try {
    await tCore.invoke("updater_check_now");
  } catch (e) {
    console.error("updater_check_now failed:", e);
  }
}

async function onRestartNow() {
  try {
    await tCore.invoke("updater_install_and_restart");
  } catch (e) {
    console.error("updater_install_and_restart failed:", e);
  }
}
```

- [ ] **Step 5: Subscribe to `updater:state-changed` events**

Find the place near the bottom of `settings.js` where the other event listener is registered (search for `tEvent.listen`). Add a new listener that re-fetches state on each updater event:

```js
tEvent.listen("updater:state-changed", () => {
  // Re-load full state so the button row's currentVersion stays in sync.
  loadAndRender();
});
```

(If there's already a `settings:state-changed` listener that calls `loadAndRender()`, just add the updater listener right next to it with the same body.)

- [ ] **Step 6: Manually verify (build + open settings)**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: clean `Finished`.

If you have a graphical environment available, run:

```bash
cargo run 2>&1 | tail -20
```

Open the settings window from the tray. The Updates row should appear last in the list with text "checking…" briefly (during the 5s startup task) then transition to "up to date · v0.4.0" (or to "couldn't check (...)" if the network/release isn't reachable yet — that's expected before any v0.5.0 is published).

If no graphical environment: skip the visual check, rely on the build success + the unit tests already covering state logic.

- [ ] **Step 7: Commit**

```bash
cd /root/vorevault-desktop
git add ui/settings.js
git commit -m "feat(ui): updates row render + handlers + event subscription"
```

---

## Task 10: Create `release.yml` workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    name: Build & upload (${{ matrix.platform }})
    runs-on: ${{ matrix.platform }}
    strategy:
      fail-fast: false
      matrix:
        platform: [windows-latest, macos-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo registry + build
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install macOS universal target
        if: matrix.platform == 'macos-latest'
        run: rustup target add aarch64-apple-darwin x86_64-apple-darwin

      - name: Build, bundle, sign, upload
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'VoreVault Desktop ${{ github.ref_name }}'
          releaseBody: ''
          releaseDraft: true
          prerelease: ${{ contains(github.ref_name, '-') }}
          projectPath: src-tauri
          args: ${{ matrix.platform == 'macos-latest' && '--target universal-apple-darwin' || '' }}

  publish:
    name: Promote draft → published
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Promote release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh release edit ${{ github.ref_name }} --draft=false
```

- [ ] **Step 2: Validate YAML syntax**

```bash
cd /root/vorevault-desktop
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow on v* tag push (tauri-action + auto-publish)"
```

---

## Task 11: Write `RELEASING.md` runbook

**Files:**
- Create: `RELEASING.md` (at repo root)

- [ ] **Step 1: Create RELEASING.md**

Create `/root/vorevault-desktop/RELEASING.md`:

```markdown
# Releasing VoreVault Desktop

Tag-driven release flow. Push a `v*` tag → GitHub Actions builds + signs + publishes a Release with `.msi` (Windows) and `.dmg` (macOS, universal) artifacts plus a signed `latest.json` manifest. Installed clients pick up the new version via `tauri-plugin-updater` on their next launch.

See `docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-e-design.md` (in the `vorevault` web repo) for the architectural background.

## Prerequisites (one-time, already done as of v0.5.0)

- Updater keypair generated and stored in 1Password + offline backup.
- GH secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set in the repo.
- Public key embedded in `src-tauri/tauri.conf.json` `plugins.updater.pubkey`.
- Repo is public so the updater endpoint can fetch release assets anonymously.

## Cutting a release

1. **Bump the version in 3 files.** Pick the new version (e.g., `0.5.1`):
   - `src-tauri/tauri.conf.json` — `"version": "0.5.1"`
   - `src-tauri/Cargo.toml` — `version = "0.5.1"`
   - `cd src-tauri && cargo build` — regenerates `Cargo.lock` with the new version.

2. **Stage all three:**
   ```bash
   git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "chore: bump to v0.5.1"
   ```

3. **Annotated tag:**
   ```bash
   git tag -a v0.5.1 -m "v0.5.1 — short description of changes"
   ```

4. **Push:**
   ```bash
   git push origin main
   git push origin v0.5.1
   ```

5. **Wait ~10–15 min.** The release workflow runs (Windows job ~25 min wall, Mac job ~5–8 min). Both must succeed before the release is promoted from draft to published.

6. **Smoke test.**
   - Download the new `.msi` or `.dmg` from the GitHub Release page.
   - Verify it installs and reports the new version.
   - From an existing prior install: open settings → click "check now" → should download in background → next quit/launch should silently update.

7. **Announce on Discord** with a link to the Release.

## Pre-release / RC tags

For testing the release workflow without affecting installed users, use tags with a `-` suffix (e.g., `v0.5.1-rc.1`). The workflow detects this and marks the GitHub Release as **prerelease**. The updater endpoint `/releases/latest/download/latest.json` excludes prereleases, so installed users never pick them up.

When the RC validates, either:
- Flip the prerelease flag off in the GitHub Releases UI (`gh release edit v0.5.1-rc.1 --prerelease=false`), OR
- Bump to the final version and tag `v0.5.1` directly (preferred — cleaner release page).

## If things go wrong

**The release was published but artifacts are broken:**

```bash
gh release delete v0.5.1 --yes --cleanup-tag
git push origin :refs/tags/v0.5.1
# Fix the issue, commit, re-tag, re-push.
```

⚠ Anyone who already auto-updated to the broken version will be stuck until the next good release ships. Communicate on Discord.

**A `release.yml` run failed mid-way:**

The workflow leaves a **draft** release in place. To retry: delete the draft (`gh release delete vX.Y.Z --yes`), fix the cause (often a transient runner issue or a GH secrets problem), then re-push the tag (`git push origin :refs/tags/vX.Y.Z && git push origin vX.Y.Z`).

**You lost the updater private key:**

There is no recovery. You must:
1. Generate a new keypair locally.
2. Update GH secrets to the new private key + passphrase.
3. Update `src-tauri/tauri.conf.json` with the new pubkey.
4. Cut a new release.
5. **Every existing installed user must manually download + reinstall** to pick up the new pubkey. Their old binaries will reject signatures from the new key as a security failure.

This is why the key lives in 1Password + an offline backup. Do not lose it.

## Known untested paths

The following are NOT covered by automated tests:

- **Updater signature mismatch behavior.** The plugin will refuse the install and the app will show "couldn't check (signature mismatch)" — this code path has only been reasoned about, not exercised.
- **Disk-full / permission-denied install failures.** Rely on the plugin's error reporting + the generic `Error` state in the settings window.

If you encounter either in production, capture the log and add the case to this document.
```

- [ ] **Step 2: Commit**

```bash
git add RELEASING.md
git commit -m "docs: add RELEASING.md runbook for tag-driven releases"
```

---

## Task 12: Bump version to 0.5.0

**Files:**
- Modify: `src-tauri/tauri.conf.json` (version field)
- Modify: `src-tauri/Cargo.toml` (version field)
- Modify: `src-tauri/Cargo.lock` (auto-regenerated by cargo)

- [ ] **Step 1: Bump tauri.conf.json**

Open `src-tauri/tauri.conf.json`. Change:
```json
"version": "0.4.0",
```
to:
```json
"version": "0.5.0",
```

- [ ] **Step 2: Bump Cargo.toml**

Open `src-tauri/Cargo.toml`. Change:
```toml
version = "0.4.0"
```
to:
```toml
version = "0.5.0"
```

- [ ] **Step 3: Regenerate Cargo.lock**

```bash
cd /root/vorevault-desktop/src-tauri
cargo build 2>&1 | tail -5
```

Expected: clean `Finished`. `Cargo.lock` now has `version = "0.5.0"` for the `vorevault` package.

Verify:
```bash
grep -A1 'name = "vorevault"' src-tauri/Cargo.lock | head -3
```
Expected output includes `version = "0.5.0"`.

- [ ] **Step 4: Commit**

```bash
cd /root/vorevault-desktop
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump to v0.5.0"
```

---

## Task 13: Open the PR + run final CI sanity checks

**Files:** none (operational task)

- [ ] **Step 1: Run the full local test + lint matrix**

```bash
cd /root/vorevault-desktop/src-tauri
cargo fmt --all -- --check 2>&1 | tail -3
cargo clippy --all-targets -- -D warnings 2>&1 | tail -10
cargo test --all 2>&1 | tail -10
cargo build --release 2>&1 | tail -5
```

Expected: all four green. Fix any issues before opening the PR.

If `cargo fmt --check` fails, run `cargo fmt --all` and re-stage `src-tauri/src/updater.rs` (and any other touched file) — D's PR caught a fmt issue at this stage; same hazard applies here.

- [ ] **Step 2: Push the branch**

```bash
cd /root/vorevault-desktop
git push -u origin feat/installers-releases
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat: installers + auto-update (Sub-project E, v0.5.0)" --body "$(cat <<'EOF'
## Summary

- New `release.yml` workflow builds + signs + publishes `.msi` and universal `.dmg` to GitHub Releases on every `v*` tag push (uses `tauri-apps/tauri-action@v0`)
- Adds `tauri-plugin-updater` with silent-on-launch update flow + manual "check now" button in the settings window
- Repo flipped to public during the brainstorm so the updater endpoint can fetch release assets anonymously
- New `RELEASING.md` documents the tag → wait → smoke-test → announce loop
- Updater keypair generated locally and added to GH Actions secrets (private never enters the repo)

Spec: https://github.com/Bullmoose-Code/vorevault/blob/spec/desktop-watcher-e/docs/superpowers/specs/2026-04-26-desktop-watcher-subproject-e-design.md
Plan: https://github.com/Bullmoose-Code/vorevault/blob/spec/desktop-watcher-e/docs/superpowers/plans/2026-04-26-desktop-watcher-subproject-e.md

## Test plan

- [ ] CI green on this PR
- [ ] After merge: tag `v0.5.0-rc.1` and verify the release workflow runs cleanly
- [ ] Verify `latest.json` is published with a non-empty signature
- [ ] Install RC on a real Windows box, click through SmartScreen, verify settings shows "up to date · v0.5.0-rc.1"
- [ ] Install RC on a real macOS box, verify same
- [ ] Verify "check now" from the prereleased install doesn't pick anything up (RC excluded from `/releases/latest`)
- [ ] Tag `v0.5.0` (no `-` suffix → not prerelease)
- [ ] Quit + relaunch on both boxes, verify auto-update path lands `v0.5.0`
- [ ] Click "restart now" — verify silent install + relaunch as new version
- [ ] Verify error path by disabling network + clicking "check now" → "couldn't check (...) · retry"

EOF
)"
```

Expected: PR URL printed. Open in browser to confirm.

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks --watch
```

Expected: both `Build & test (windows-latest)` and `Build & test (macos-latest)` go green. If anything fails, fix locally + push + re-watch.

---

## Post-merge: cut the v0.5.0 release

These steps are NOT part of the PR. They run after the PR is merged into main.

**Run the full end-to-end test runbook from `RELEASING.md` § Pre-release / RC tags:**

1. On main, bump to `0.5.0-rc.1` (per Task 13's procedure but with `-rc.1` suffix), tag, push.
2. Wait for `release.yml` to publish the prerelease.
3. Verify in the GH Releases UI: "Pre-release" badge is set on `v0.5.0-rc.1`.
4. Verify both `.msi` and `.dmg` artifacts exist + `latest.json` is signed (open it; the `signature` field is non-empty).
5. Install on real Windows, verify everything works.
6. Install on real macOS, verify everything works.
7. From both installs, click "check now" — should still show "up to date · v0.5.0-rc.1" (because the `latest` endpoint excludes prereleases). This is the critical safety check.
8. Bump to `0.5.0`, tag, push.
9. After workflow publishes: quit + relaunch both installed clients. Watch them auto-update. Verify the new version appears in settings.

Once all 9 steps pass, v0.5.0 is real and friends can be told to download it.

---

## Files touched summary

**Created:**
- `src-tauri/src/updater.rs` (state enum + 3 commands + startup task + 7 unit tests)
- `src-tauri/permissions/autogenerated/commands/updater_get_state.toml`
- `src-tauri/permissions/autogenerated/commands/updater_check_now.toml`
- `src-tauri/permissions/autogenerated/commands/updater_install_and_restart.toml`
- `.github/workflows/release.yml`
- `RELEASING.md`

**Modified:**
- `src-tauri/Cargo.toml` (add tauri-plugin-updater dep, bump version)
- `src-tauri/Cargo.lock` (auto)
- `src-tauri/tauri.conf.json` (bump version, add plugins.updater config)
- `src-tauri/src/main.rs` (mod updater, plugin registration, command registration, startup task spawn)
- `src-tauri/capabilities/settings.json` (4 new permission entries)
- `ui/settings.html` (add Updates row)
- `ui/settings.css` (Updates row styles)
- `ui/settings.js` (renderUpdates + handlers + event subscription + extended loadAndRender)
