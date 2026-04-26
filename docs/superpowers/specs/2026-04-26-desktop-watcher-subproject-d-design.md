# Desktop Watcher — Sub-project D: Settings window

Implements the fourth of five sub-projects (A → B → C → D → E) of **Theme 1.1** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`. Sub-projects A (auth + keychain, v0.1.0), B (folder watcher + tus upload pipeline, v0.2.0), and C (native upload notifications, v0.3.0) are shipped. This spec introduces the first user-facing window in vorevault-desktop and the controls that belong in it: change watch folder, sign out, launch at login, and version. It also adds one new tray feature — soft-pause uploads — as the natural counterpart to the tray reorganization the window enables.

## Goal

A user, signed in and watching a folder via Sub-projects A+B+C, can:

1. Open a small, brand-styled settings window from a new tray menu item "Open VoreVault…".
2. See their Discord username, change watch folder, sign out, and toggle launch-at-login from inside the window.
3. Pause and resume uploads from the tray without quitting the app — useful during a recording session when the user wants the upload pipeline quiet for a bit.
4. On first sign-in, see the settings window auto-open instead of the existing native folder-picker dialog from Sub-project C — the window doubles as onboarding for the watch folder.

The window is intentionally small (4 control rows + a footer) and styled to match vault.bullmoosefn.com — Fraunces italic display, Inter UI, sticker-shadow buttons, cream palette. It is the first time the desktop client has a UI surface other than the OAuth success page and tray menu.

## Why now

v0.3.0 ships a complete capture-to-vault loop: auto-upload + native toast confirmation. The remaining friction is configuration. Today the only way to change the watch folder is to sign out and sign in again (which re-triggers the auto-prompt dialog from C); the only way to sign out is the tray; the only way to know the app version is to inspect `Cargo.toml`. v0.4.0 lifts these from "hidden" to "discoverable" by introducing the settings window.

The "Pause uploads" toggle ships in this version (rather than waiting for D+1) because moving the watch-folder picker out of the tray creates an opportunity to reorganize the tray menu, and "Pause" is the natural new entry to slot in alongside the existing notifications toggle.

## Non-goals (deferred)

- **No upload-history view** inside the window. Overlaps awkwardly with the toast notifications shipped in C.
- **No "scan watch folder now" button.** The watcher already catches everything reactively; manual rescan is power-user territory for a future sub-project.
- **No log file or "Reveal log in Finder" action.** Today logging is `env_logger` to stderr only, which a tray-launched app effectively swallows. Exposing a real log file requires adding a file-appender layer (`tracing-appender` or similar) — its own future improvement. For now the version row is paired with a "report an issue ↗" footer link to GitHub Issues.
- **No multiple watch folders.** Theme 1.2 territory (per-folder routing).
- **No `vorevault://` deep-link handling.** Theme 1.3.
- **No window position memory** across launches. Centered each time.
- **No keyboard shortcut to open settings.** Tray click is the only entry point.
- **No icon swap when paused.** Tray status row text only — keeps this sub-project from sprawling into icon-asset work.
- **Pause does not persist** across app restart. Pause is a "shut up for this session" toggle, not a stored preference.

## Architecture

One new Rust module, one new HTML/CSS/JS bundle, one new Tauri plugin, edits to four existing modules.

```
src-tauri/src/
├── settings_window.rs   ← NEW. Owns the WebviewWindow lifecycle:
│                          create-or-focus, hide-on-close, single-instance.
│                          Registers #[tauri::command]s called by the JS:
│                            get_state, change_watch_folder, sign_out,
│                            set_autostart, get_autostart.
│                          Subscribes to pipeline events and pushes them
│                          to the window via app_handle.emit("settings:state-changed", …).
├── pipeline.rs          ← edit. Add Pause/Resume API (Atomic + cvar).
│                          Workers check the paused flag in their dispatch loop.
│                          New emit point: "settings:state-changed" fires
│                          when watch folder, sign-in, paused state flip.
├── tray.rs              ← edit. Hybrid menu (see Tray menu below).
├── auth.rs              ← edit. Extract sign-out body into a reusable fn
│                          callable from both tray and settings_window.
├── main.rs              ← edit. Wire settings_window plugin + autostart
│                          plugin. Replace the post-auth native folder
│                          dialog from Sub-project C with
│                          settings_window::show_first_run().

src-tauri/ui/            ← NEW directory, bundled into the binary as
│                          static assets and loaded via the webview's
│                          tauri:// scheme. Path configured in
│                          tauri.conf.json (build.frontendDist) so the
│                          Tauri builder copies it into the app bundle.
├── settings.html        ← Static markup, mirrors the brand mockup.
├── settings.css         ← Hand-ported tokens (cream, ink, Fraunces,
│                          Inter, sticker-shadow button) ~60 lines.
├── settings.js          ← invoke()/listen() bridge, ~80 lines.
└── fonts/               ← Self-hosted Fraunces + Inter + JetBrains Mono
                           woff2 files (~150 KB total). Bundled offline so
                           the app works without internet on first paint.
```

**New Tauri plugin dependency:** `tauri-plugin-autostart` (official, MIT). Wraps platform-specific autostart (LaunchAgents on macOS, registry Run key on Windows, `.desktop` file on Linux). One toggle, one read.

**Asset bundling.** Tauri bundles `src-tauri/ui/**` into the binary at build time and serves it from a `tauri://localhost` URL. No HTTP server, no localhost port (unlike the OAuth callback in Sub-project A which is `tiny_http` on a random port). The webview loads the local file URL directly.

**Window config (in `tauri.conf.json`):**
- label: `settings`
- 480 × 420 fixed (`resizable: false`)
- centered on creation
- `decorations: true`
- `visible: false` at startup (created hidden, shown on demand or first-run)
- `skipTaskbar: false` on macOS (window appears in dock when shown), `true` on Windows (taskbar entry would feel wrong for a tray app)

**Hide-on-close behavior** is not a config option — it's implemented by intercepting the window's `CloseRequested` event in `settings_window.rs`, calling `event.api.prevent_close()` then `window.hide()`. The window object stays alive in memory and re-show is instant. (Pattern: `WindowEvent::CloseRequested { api, .. }` handler registered when the window is built.)

## Window layout

The window has 4 control rows plus a footer. All rows share the same horizontal layout: label on the left, value/control on the right, separated by a 1px dashed cream-tone border between rows. Brand styling per the visual-style mockup approved during brainstorming.

```
┌─────────────────────────────────────────────────────────┐
│ ●●●  VoreVault                                          │  ← title bar (system chrome)
├─────────────────────────────────────────────────────────┤
│                                                         │
│  settings                                               │  ← Fraunces italic, 26px
│  vault.bullmoosefn.com                                  │  ← lowercase subtitle, 11px
│                                                         │
│  account                  @ryan      [ sign out ]       │  ← danger-tone sticker button
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│  watch folder             [ ~/Videos/Clips ]            │  ← sticker button = current path
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│  launch at login          [ on ]                        │  ← sticker button, green tint when on
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│  version                  v0.4.0                        │  ← monospace
│                                                         │
│ ─────────────────────────────────────────────────────── │
│  self-hosted clip vault          report an issue ↗      │  ← footer link → GitHub Issues
└─────────────────────────────────────────────────────────┘
```

### Per-row behaviors

- **account.** Displays the Discord username from `/api/auth/me` (already cached in pipeline state). "sign out" clears keychain, stops watcher+pipeline, swaps the window to a signed-out empty state.
- **watch folder.** Button text is the current path, ellipsis-truncated if longer than 28 chars. Click opens `tauri-plugin-dialog` native folder picker. On selection: smooth swap (in-flight uploads finish, watcher restarts on the new path, dedupe index preserved).
- **launch at login.** Toggle via `tauri-plugin-autostart`. Reads current state on window show; writes immediately on click; re-reads after write to confirm.
- **version.** Read from `CARGO_PKG_VERSION` at build time. Static text in monospace.
- **report an issue ↗.** Opens `https://github.com/Bullmoose-Code/vorevault-desktop/issues/new` in the default browser via `tauri-plugin-opener`.

### Empty / error states

- **signed out.** Account row shows `not signed in` + a `sign in with Discord` sticker button; folder + autostart rows are visually disabled (greyed out, not clickable).
- **watch folder unset** (first-run before user picks). Button text reads *"choose a folder…"* in italic with a soft warning color. No separate banner — same row, different label.
- **autostart fails to set.** Tray toast (reuses notifier from Sub-project C): `couldn't set launch at login — check system settings`. JS re-reads autostart state and re-renders (toggle stays in its prior state).
- **change_watch_folder error** (path unreadable). JS shows inline error in the row: `can't access that folder` in warning color. No state change.

## Tray menu (after reorganization)

Hybrid: tray keeps frequent toggles (notifications, the new pause), window owns rare config (sign-out, change-folder, autostart, version).

```
─ Signed in as @ryan                        [disabled]
─ Watching: ~/Videos/Clips                  [disabled]
─ ⏸ Paused                                  [disabled, only when paused]
─ Uploading 1 of 3…                         [disabled, only when active]
─────────
─ Show notifications                ✓
─ Pause uploads                     ✓ / □
─────────
─ Open VoreVault…
─────────
─ Quit
```

**Removed from tray** (now lives only in the window): `Pick folder…`, `Sign out`. The corresponding `tray.rs` items are deleted.

**Kept in tray**: `Show notifications` (frequent toggle, matches existing UX from Sub-project C), the new `Pause uploads`, status rows.

**New: `Open VoreVault…`** — opens the settings window (or focuses it if already open).

## Pause uploads

Pure pipeline change, no UI beyond the tray toggle.

`pipeline.rs` gets a single `paused: Arc<AtomicBool>` field plus a `Condvar` for parking workers. The dispatch loop:

```rust
loop {
    if self.paused.load(Ordering::Acquire) {
        // park the worker — wait on a condvar woken by set_paused(false)
        self.pause_cvar.wait_while(...);
    }
    let item = self.queue.recv()?;
    upload(item)?;
}
```

In-flight uploads (the 2 currently in `upload(...)`) are not interrupted — they finish naturally. The watcher keeps running and queueing files. Resume = `set_paused(false)` + `notify_all` on the cvar wakes the parked workers, who drain the queue.

**Persistence:** none. `paused` defaults to `false` on every app start.

**Notifier interaction:** Sub-project C's `decide_notification` already fires the batch summary when the drain condition becomes true regardless of how long the queue was non-empty. No notifier changes needed. Failure notifications continue to fire immediately even during pause — failures aren't batched, and the user wants to know.

## Data flow

```
                         ┌─────────────────────────────────────────┐
                         │  src-tauri/src/settings_window.rs       │
                         │                                         │
   tray "Open VoreVault…"│  show()                                 │
   ──────────────────────►   ├─ if window exists → focus + return  │
                         │   └─ else create + register listeners   │
                         │                                         │
   first sign-in success │  show_first_run()                       │
   (replaces native      │   └─ same as show() (the JS detects    │
    folder dialog from C)│       missing folder + renders prompt) │
                         │                                         │
                         │  #[tauri::command]s:                    │
                         │   - get_state() → SettingsState         │
                         │   - change_watch_folder(path) → ()      │
                         │   - sign_out() → ()                     │
                         │   - set_autostart(enabled) → ()         │
                         │   - get_autostart() → bool              │
                         │                                         │
                         │  emits:                                 │
                         │   "settings:state-changed" → SettingsState│
                         │     fired on watch_folder swap, sign-in,│
                         │     sign-out, pause toggle              │
                         └────────┬───────────────────▲────────────┘
                                  │ invoke           │ listen
                                  ▼                  │
                         ┌─────────────────────────────────────────┐
                         │  src-tauri/ui/settings.js  (~80 LOC)    │
                         │                                         │
                         │  on window 'tauri://load':              │
                         │    state = await invoke("get_state")    │
                         │    autostart = await invoke("get_autostart")│
                         │    render(state, autostart)             │
                         │                                         │
                         │  listen("settings:state-changed", s =>  │
                         │    render(s, autostart))                │
                         │                                         │
                         │  click handlers call invoke(...).       │
                         │  no local state, no diffing — re-render │
                         │  the whole <body> on each state event   │
                         └─────────────────────────────────────────┘
```

`SettingsState` (one struct, one source of truth):

```rust
pub struct SettingsState {
    pub username: Option<String>,    // None when signed out
    pub watch_folder: Option<PathBuf>, // None on first-run
    pub paused: bool,                  // mirrored from pipeline
    pub version: &'static str,         // CARGO_PKG_VERSION
}
```

### Key principles

1. **Single source of truth in Rust.** The JS never holds derived state. Every render consumes a freshly-fetched `SettingsState`.
2. **Backend pushes on change.** Whenever `pipeline.rs` / `auth.rs` / `settings_window.rs` mutates anything in `SettingsState`, it calls a single helper `app_handle.emit("settings:state-changed", current_state())`. Closed window? `emit()` is a cheap no-op. Open window? Auto-syncs.
3. **autostart is read separately.** It's the only field that comes from a system source (LaunchAgents / registry) instead of in-process state. Read once on window open; write-and-re-read on toggle. Not part of `SettingsState` because it doesn't change while the window is closed.
4. **No async in-flight tracking in JS.** Click "sign out" → button disabled until the state-changed event arrives → re-render shows signed-out state. No loading spinners, no half-states. Errors surface as tray toasts via the existing notifier.
5. **Single-instance enforcement.** Re-clicking "Open VoreVault…" while the window exists calls `window.set_focus()` only — never creates a second window. Closing (X / Cmd+W) calls `window.hide()`, not `close()`.

## First-run flow

```
  Cold start, never signed in
  ───────────────────────────────────────────────────────────────────

  app launches
       │
       ▼
  tray icon appears, menu shows "Sign in with Discord", "Quit"
  settings window: created, hidden
       │  (user clicks "Sign in with Discord")
       ▼
  auth.rs runs PKCE flow (unchanged from Sub-project A)
       │  on success: keychain stores token, /api/auth/me returns username
       ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  NEW: settings_window::show_first_run() instead of            │
  │  the native folder-picker dialog from Sub-project C.          │
  │                                                                │
  │  Window appears (centered, focused). The JS calls get_state() │
  │  → SettingsState { username: Some("@ryan"),                   │
  │                    watch_folder: None, paused: false, ... }    │
  │  → render shows account row populated, watch folder row       │
  │    reading "choose a folder…" in italic warning.              │
  └───────────────────────────────────────────────────────────────┘
       │  (user clicks the "choose a folder…" button)
       ▼
  Native folder picker opens (tauri-plugin-dialog)
       │  on selection: invoke("change_watch_folder", path)
       ▼
  pipeline.rs starts watcher + workers (existing logic from Sub-project B)
  state-changed event fires → window re-renders with the path
       │
       ▼
  Tray menu now shows full status. Window can be closed; app keeps running.
```

### Cancellation paths

- **User dismisses the first-run window without picking a folder.** Window hides; the app is signed in but not watching. Tray menu shows `Signed in as @ryan` and `Watching: not set`. Per the hybrid tray, `Pick folder…` is no longer in the tray — the user must reopen the window via `Open VoreVault…` to fix this. **Acceptable.** Closing the first-run window without picking a folder leaves the app dormant; reopening via the tray gives the user a path to recover.
- **User closes the window without signing in.** Same as today: window doesn't auto-open in this case. They use the tray's "Sign in with Discord" item.

### Subsequent launches

Window does not auto-open. Tray icon shows current state, user opens window only on demand via tray click.

### Sign out / sign in transitions

- **Sign out, then sign in again** (within a session). `sign_out` keeps the window visible and re-renders the empty state with "sign in with Discord". Re-signing in does *not* re-trigger the first-run window flow (it's already open). State just updates.
- **Sign out, quit, reopen, sign in.** This *does* trigger first-run flow. Cleanest mental model: "first sign-in after the app started without credentials" → first-run.

## Error handling

| Where | Failure | User-visible behavior |
|---|---|---|
| `change_watch_folder` | path doesn't exist / unreadable | invoke() returns Err. JS shows inline error in the row: `can't access that folder` in warning color. No state change. |
| `change_watch_folder` | watcher fails to start on new path | Old watcher already stopped. Pipeline emits state with `watch_folder = None`. Window re-renders to "choose a folder…". Tray toast: `VoreVault — couldn't watch <path>`. |
| `set_autostart(true)` | OS denies (permissions on macOS, etc.) | invoke() returns Err. Tray toast: `couldn't set launch at login — check system settings`. JS re-reads autostart state and re-renders (toggle stays "off"). |
| `sign_out` | keychain delete fails | Logged via `log::error!`. UI continues — pipeline stops, state shows signed-out, but the next sign-in attempt may fail until keychain is sorted. Acceptable: keychain corruption is rare and user can quit/relaunch. |
| `get_state` (first call after window open) | shouldn't happen — pure in-process read | If somehow it does, JS renders an error sentinel: `VoreVault — couldn't load settings, please reopen` and disables all controls. |
| Settings window itself | webview fails to create (Tauri internal) | Logged + tray toast: `couldn't open settings window`. App continues running. |
| `tauri-plugin-opener` | "report an issue" link can't open browser | Silent (best-effort). Logged. Acceptable for a footer link. |

**No retry logic anywhere in the window.** Settings actions are user-initiated and instant — the user can click again. Retry belongs in the upload pipeline, not here.

**No error boundaries / try-render-fallback in JS.** A runtime exception in `render()` would leave the window blank. Mitigation: the JS is small (~80 lines) and pure DOM construction. We accept the risk.

## Testing

**Unit tests (`cargo test`, in-process, no Tauri runtime):**

- `pipeline::set_paused` — push items, pause, push more, assert worker count doesn't advance; resume, assert all drain.
- `pipeline::SettingsState::current(...)` — pure constructor function that snapshots state. Verify each branch (signed in vs not, watch_folder set vs not, paused vs not).
- `settings_window::format_path_for_button(path, max_chars)` — pure helper that ellipsis-truncates the watch folder path for the button label. Test cases: short path, long path, path with multibyte chars, root path, empty.

**Integration tests (Rust, with Tauri's `MockRuntime`):**

- `change_watch_folder` happy path — prepare a temp dir, invoke the command, assert pipeline restarts with new path + state-changed event fires.
- `change_watch_folder` bad path — point at a non-existent path, assert Err returned, no state change, no event.
- `sign_out` — set up a fake signed-in state, invoke, assert keychain delete called, pipeline stopped, state-changed event fires with `username: None`.
- `set_autostart` — call with both true/false, assert plugin is invoked correctly. (We can't really test the OS side; trust the plugin.)

**Manual test plan** (the JS side and end-to-end). There's no JS test infrastructure (no node, no Vitest in this repo). For ~80 lines of vanilla JS doing DOM construction + invoke()/listen() bridging, we test by hand. The plan goes in the PR description as a checklist:

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

**Out of scope for tests:** visual regression, accessibility audits, keyboard nav (the window is mouse-only — no Tab order spec, no shortcuts).

## What ships in v0.4.0

- New settings window (4 rows + footer, brand-styled, 480×420, opens via tray or first-run).
- New tray menu structure (hybrid: status + notifications + pause + Open VoreVault… + Quit).
- New tray toggle: Pause uploads (soft pause, non-persistent, text-only indicator).
- Replaces post-auth native folder-picker dialog with the settings window.
- New Rust dependency: `tauri-plugin-autostart`.
- New asset directory: `src-tauri/ui/` with bundled fonts (~150 KB).

## What does NOT ship in v0.4.0

- Anything in the Non-goals list above.
- Sub-project E (signed installers + GitHub Releases). Distribution is still "build it yourself" until E lands.
