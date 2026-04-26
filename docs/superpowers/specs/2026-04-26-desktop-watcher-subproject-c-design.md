# Desktop Watcher — Sub-project C: Native upload notifications

Implements the third of five sub-projects (A → B → C → D → E) of **Theme 1.1** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`. Sub-projects A (auth + keychain, v0.1.0) and B (folder watcher + tus upload pipeline, v0.2.0) are shipped. This spec closes the silent-success loop: the user drops a clip, the upload happens, and a small native OS notification confirms it landed — without disrupting an active gaming session.

## Goal

A user, signed in and watching a folder via Sub-projects A+B, sees:

1. After dropping a single file, a small native OS notification "Uploaded clip.mp4 ✓" once it lands.
2. After dropping multiple files in a burst (typical case: select 5 clips, drag them in at once), exactly one summary notification "Uploaded 5 clips ✓" once the queue drains.
3. After a permanent upload failure (backoff exhausted), an immediate notification "VoreVault — upload failed: clip.mp4". The body includes the watch-folder path so the user knows which file/folder the failure refers to.
4. A tray menu toggle "Show notifications: On / Off" they can flip at will.

Notifications are **informational only** — clicking dismisses (OS default) but does not navigate. `tauri-plugin-notification` v2's desktop API doesn't expose click callbacks; building one would require forking the plugin or adding a custom WebSocket-bridged window, which is out of scope. The user can pop the tray menu or open the vault manually if they want to follow up.

**Crucially**, while gaming, the OS itself (Windows Focus Assist or macOS Do Not Disturb, both auto-engageable when a fullscreen app is foregrounded) suppresses these notifications. The app does not implement its own fullscreen-detection layer — we trust the OS.

**The app does NOT yet** show a settings window (Sub-project D) or ship signed installers (Sub-project E).

## Why now

v0.2.0 ships a working but invisible auto-uploader. A friend drops a clip, sees nothing, has to alt-tab to the vault to confirm it arrived. That breaks the "set it and forget it" promise. v0.3.0 adds the minimum confirmation needed to trust the pipeline — a small toast — without becoming the kind of always-pinging app you mute and forget about.

## Architecture

One new module + targeted edits to four existing ones (`config.rs`, `pipeline.rs`, `tray.rs`, `main.rs`).

```
                                            ┌────────────────────────────────┐
                                            │  Tray menu (extended)          │
                                            │  ─ Signed in as @ryan          │
                                            │  ─ Watching: <path>            │
                                            │  ─ Uploading 1 of 3…           │
                                            │  ─ Pick folder…                │
                                            │  ─ Show notifications: On  ◄── │ NEW
                                            │  ─ Sign out                    │
                                            │  ─ Quit                        │
                                            └────────────────────────────────┘
                                                          │ click toggles
                                                          ▼
                                                  config.notifications_enabled
                                                          │ read on each notify call
   ┌───────────────────┐                                  │
   │  pipeline.rs      │ on_success ─────► successes_this_drain++
   │  - workers (N=2)  │                ─► if (uploading + queued) == 0:
   │  - drain counter  │                     emit Single OR Batch via notifier
   │                   │ on_failure ─────► emit Failure via notifier
   └────────┬──────────┘
            │ notifier::notify_*(app_handle, ...)
            ▼
   ┌───────────────────┐                ┌──────────────────────┐
   │  notifier.rs (NEW)│ ──── reads ──► │ tauri-plugin-        │
   │  - notify_success │                │   notification       │
   │  - notify_batch   │                │ (OS: Action Center / │
   │  - notify_failure │                │  Notification Center)│
   └───────────────────┘                └──────────────────────┘
                                                    │
                                                    ▼
                                          fire-and-forget
                                          (no click callback)
```

### Components

**`src-tauri/Cargo.toml`** — add one dep:
```toml
tauri-plugin-notification = "2"
```

**`src-tauri/src/notifier.rs`** (new) — three thin functions plus a pure formatter:

```rust
pub enum NotifyEvent {
    Single { filename: String },
    Batch  { count: u32 },
    Failure { filename: String, watch_folder: String },
}

pub fn notify(app: &AppHandle, cfg: &Config, event: NotifyEvent);

// Pure — testable without an AppHandle.
pub fn title_and_body(event: &NotifyEvent) -> (String, String);
```

`notify` short-circuits if `cfg.notifications_enabled == false`. Otherwise builds a notification through `tauri_plugin_notification::NotificationExt`, with title/body from `title_and_body`. Errors from the plugin are logged at `warn` once per process (a flag inside the module) to avoid log spam if permission is denied.

**`src-tauri/src/uploader.rs`** — no signature change.

The tusd POST `Location` header points at the tusd resource (e.g. `/files/<tus_id>`), not at the vault's file detail page. The web repo has no route mapping `tus_id → vault file id` and adding one is out of scope for Sub-project C. All click actions open the vault home instead, so the uploader does not need to surface the file URL. (If we ever want per-file deep-linking, that's an add-on for Sub-project D plus a new web API endpoint.)

**`src-tauri/src/pipeline.rs`** — add success-batch trigger logic.

New state:
```rust
struct PipelineState {
    // ...existing fields...
    successes_this_drain: AtomicU32,        // bumped on each success, reset on toast emit
    notify_lock: Mutex<()>,                  // serializes the check-and-fire critical section
}
```

New pure function (testable without I/O):
```rust
pub enum NotificationAction { None, Single, Batch(u32), Failure }

pub fn decide_notification(
    in_flight: u32,
    queued: u32,
    successes_this_drain: u32,
    notifications_enabled: bool,
) -> NotificationAction {
    if !notifications_enabled { return NotificationAction::None; }
    if in_flight + queued > 0   { return NotificationAction::None; }
    match successes_this_drain {
        0 => NotificationAction::None,
        1 => NotificationAction::Single,
        n => NotificationAction::Batch(n),
    }
}
```

Worker thread, after a successful upload, calls a new `pipeline.on_success(filename)`:
1. Bumps `successes_this_drain`.
2. Records to DB (existing).
3. Acquires `notify_lock`, snapshots in_flight/queued, calls `decide_notification`. If `Single` → `notifier::notify(app, cfg, NotifyEvent::Single { filename })`; if `Batch(n)` → `notifier::notify(app, cfg, NotifyEvent::Batch { count: n })`; resets `successes_this_drain` to 0. Releases lock.

Worker thread, after a permanent failure, calls `pipeline.on_failure(filename)`:
1. Records failure (existing).
2. Calls `notifier::notify(app, cfg, NotifyEvent::Failure { filename, watch_folder })` immediately (independent of the success batch — failures don't touch the counter).

**`src-tauri/src/config.rs`** — add field with default:
```rust
pub struct Config {
    // ...existing...
    #[serde(default = "default_true")]
    pub notifications_enabled: bool,
}
fn default_true() -> bool { true }
```
Backfilled `true` for existing config.json files via serde default — no migration needed.

**`src-tauri/src/tray.rs`** — add toggle menu item.

In the signed-in-with-pipeline branch of `build_menu`, add between `pick-folder` and `sign-out`:
```rust
let notif_label = if cfg.notifications_enabled { "Show notifications: On" } else { "Show notifications: Off" };
let notif = MenuItem::with_id(app, "toggle-notifications", notif_label, true, None::<&str>)?;
```
And in `handle_menu_event`, add:
```rust
"toggle-notifications" => spawn_toggle_notifications(app.clone()),
```
`spawn_toggle_notifications` loads config, flips the bool, saves, calls `refresh_menu`. Cheap.

**`src-tauri/src/main.rs`** — register the plugin:
```rust
.plugin(tauri_plugin_notification::init())
```

## Data flow

**Single-file happy path** (drop one clip):
1. Watcher → pipeline enqueues file.
2. Worker uploads → returns `Ok(())`.
3. Worker calls `pipeline.on_success(filename)`.
4. Bumps counter to 1; queue empty; `decide_notification` → `Single`.
5. `notifier::notify(app, cfg, NotifyEvent::Single { filename })` builds and sends the toast.
6. Toast appears in OS notification center, dismisses on click (no app navigation).

**Burst happy path** (drop 5 clips at once):
- Successes 1–4: bump counter, queue still has work (`in_flight + queued > 0`), `decide_notification` → `None`. No toast.
- Success 5: counter=5, queue empty → `Batch(5)`. One toast: "Uploaded 5 clips ✓".

**Failure path** (network down, retries exhausted):
- Worker hits permanent failure → `pipeline.on_failure(filename)`.
- `notifier::notify(app, cfg, NotifyEvent::Failure { filename, watch_folder })`.
- Toast: title "VoreVault — upload failed", body `"clip.mp4 in <watch folder>"`.

**Mixed drain** (3 successes + 1 permanent failure during the same drain):
- Failure fires its own toast immediately on `on_failure`. Counter untouched.
- 3 successes bump counter to 3. When queue drains → `Batch(3)`.
- User sees: 1 failure toast (immediate) + 1 batch toast (when drain completes).

## Permissions

Native notifications require permission on macOS. We let the OS handle it lazily: on first `notifier::notify` call, the OS shows the system permission prompt. If the user denies, subsequent `tauri_plugin_notification` calls return Err; we log warn once and continue. **Uploads always work regardless of notification permission.**

We deliberately do NOT pre-prompt for notification permission at sign-in or app startup. Forcing a permission prompt before the user has any reason to want notifications is bad UX. The first toast attempt happens after their first upload completes — they're already engaged with the feature.

Windows and Linux: no permission flow — toasts just work.

## Toggle behavior

- Default: `notifications_enabled = true` for new installs and existing v0.2.0 configs (via serde default).
- Toggle is per-install, persisted in `config.json`. Survives app restart.
- Toggle off → all `notifier::notify` calls short-circuit. Pipeline keeps working; counter still bumps but toasts don't fire. The next time toggle goes back to On, behavior resumes from the next success (no retroactive toast for files uploaded while Off).

## Error handling

| Situation | Behavior |
|---|---|
| Notification permission denied (macOS) | `notifier` logs warn once per process, suppresses repeated warnings. Uploads continue. |
| `tauri_plugin_notification` send returns Err for any other reason | Log warn at `debug` level (avoid spam), continue. |
| App quits with successes pending in counter | Batch toast lost. Acceptable: success is in the DB and visible in the vault. We do NOT persist pending toasts. |
| User toggles off mid-batch | Pending batch silently dropped; counter reset by next call's short-circuit. |
| Two workers race on "is queue empty" check | `notify_lock` mutex serializes the check-and-fire. Worst case without the lock would be two duplicate toasts; the lock prevents that. |

## Testing

**Unit (added to `pipeline.rs`):**
- `decide_notification` — exhaustive table tests: `(0/0/0/true) -> None`, `(0/0/1/true) -> Single`, `(0/0/5/true) -> Batch(5)`, `(0/0/1/false) -> None`, `(1/0/5/true) -> None`, `(0/1/5/true) -> None`, etc.
- The single-vs-batch threshold (1 vs 2+).
- The toggle short-circuit.

**Unit (new `notifier.rs`):**
- `title_and_body(&NotifyEvent::Single { filename: "clip.mp4".into() })` → `("VoreVault", "Uploaded clip.mp4 ✓")`.
- `title_and_body(&NotifyEvent::Batch { count: 5 })` → `("VoreVault", "Uploaded 5 clips ✓")`.
- `title_and_body(&NotifyEvent::Failure { filename: "clip.mp4".into(), watch_folder: "C:\\Users\\ryan\\Clips".into() })` → `("VoreVault — upload failed", "clip.mp4 in C:\\Users\\ryan\\Clips")`.

**Manual smoke test (added to PR description):**
1. Drop 1 file → expect single toast "Uploaded clip.mp4 ✓".
2. Drop 5 files at once → expect 1 batch toast "Uploaded 5 clips ✓".
3. Disconnect network, drop 1 file, wait for retries to exhaust (~few minutes, depending on backoff schedule) → expect failure toast "clip.mp4 in <watch folder>".
4. Tray → "Show notifications: On" → click → label becomes "Off" → drop file → no toast appears.
5. Tray → click again → label back to "On" → drop file → toast resumes.
6. macOS first-run: drop a file → expect OS permission prompt → grant → toast appears for that or the next upload.
7. Enable Windows Focus Assist (or macOS Focus / Do Not Disturb), drop a file → no toast appears (suppressed by OS) — confirms gaming-mode behavior.

## Out of scope (explicit YAGNI)

- **Click-to-navigate from any toast** — `tauri-plugin-notification` v2's desktop API has no click-callback. Building one would require either forking the plugin or routing through a hidden Tauri WebView window, both of which dwarf the rest of this sub-project. The toast is purely informational; user opens the vault manually if they want to follow up.
- Per-event toggles (success vs failure separately) — wait for Sub-project D's settings window.
- Custom toast UI (in-app overlay window) — native is sufficient and gaming-friendly via OS DND. (This is also where click-to-navigate could plausibly come back if we ever decide we need it.)
- Sound configuration — defer to OS settings; we don't override.
- Toast persistence (replay missed toasts after re-enabling) — successes in DB are the source of truth; missed toasts don't matter.
- Per-file thumbnail in toast — Tauri's notification API supports an icon path, but our friend group cares about "did it upload" not "is this the right clip", and adding image attachments is meaningfully more code (cross-platform image path handling).
- Fullscreen-detection in our app — trust OS Focus Assist / DND. Documented in the README.

## Versioning

Ships as `vorevault-desktop` v0.3.0. Changelog headline: "Native upload notifications — silent during gaming, with a tray toggle."

## File-level summary

| Path | New / Modified | LOC estimate |
|---|---|---|
| `src-tauri/Cargo.toml` | Modified (add dep) | +1 |
| `src-tauri/src/notifier.rs` | **New** | ~120 (incl. tests) |
| `src-tauri/src/pipeline.rs` | Modified (counter + decide_notification + on_success/on_failure) | +80 (incl. tests) |
| `src-tauri/src/config.rs` | Modified (add field with serde default) | +5 |
| `src-tauri/src/tray.rs` | Modified (toggle menu item + handler) | +30 |
| `src-tauri/src/main.rs` | Modified (register plugin) | +1 |

Total: ~240 LOC of code + tests. One new module, five modifications, no architectural shift.
