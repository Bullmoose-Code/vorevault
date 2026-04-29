# Desktop — Theme 1.3: `vorevault://` deep-link protocol

Implements **Theme 1.3** of [`docs/superpowers/specs/2026-04-25-roadmap-design.md`](2026-04-25-roadmap-design.md). Theme 1.1 (the watcher app, sub-projects A–E) shipped over v0.1.0 → v0.5.x. Theme 1.2 (per-folder routing) shipped as v0.6.0. This spec adds an OS-level URL-scheme handler so external links can deep-link into the user's vault: clicking `vorevault://open/files/<uuid>` opens the matching file detail page in the user's default browser. The desktop app is the *consumer*; a small companion change to the vault web UI provides the producer surface (a "Copy desktop link" button on file detail pages).

Targets `vorevault-desktop` `v0.7.0`. The vault-side UI change rides in a separate vault-repo PR coupled to the desktop release.

## Goal

A user with VoreVault Desktop installed can:

1. Click a `vorevault://open/files/<uuid>` link from any source (Discord, email, Slack, address bar) and have their default browser open `https://<configured-vault>/files/<uuid>`.
2. Get the same behavior whether the desktop app is already running in the tray or not — clicks while the app is running do not spawn a second tray icon.
3. Generate such a link from the vault web UI by clicking a "Copy desktop link" button on the file detail page.

The protocol is a path-passthrough scheme: the desktop app translates `vorevault://open/<path>[?<query>][#<fragment>]` to `<vault_url>/<path>[?<query>][#<fragment>]` and hands the result to the system browser. Future expansion to folders, tags, search, etc. requires no desktop changes — only producer-side surfaces that emit those paths.

## Why now

v0.6.0 closed the "I uploaded a clip and it has the right tags and folder" loop. The remaining gap is the "now go watch it" half: a user (or a friend of theirs) sees a notification that a clip exists and wants to jump straight to it. Today the only way is to navigate to the vault root and find the clip manually. A `vorevault://` scheme is the conventional desktop solution and unlocks every future producer (Discord bot, email digest, share-extension, future tray-toast click handler) without each producer needing its own routing logic.

The roadmap sized this S; this spec preserves that by deliberately scoping out related-but-separate work (see Non-goals).

## Non-goals (deferred)

- **Tray-toast click → file detail page.** `tauri-plugin-notification` v2 desktop has no click callback (per `notifier.rs` line 1). Making toasts clickable requires swapping notification stacks (e.g. `winrt-notification` on Windows + `mac-notification-sys` on macOS) — a cross-platform notification rewrite of its own. Filed separately as a future Theme 1 item; the protocol handler shipped here is what that future ticket will *call into*.
- **Discord bot integration that auto-posts `vorevault://` links** on upload. Server-side feature, separate roadmap item.
- **"Open in app" launch buttons on the vault page.** A user already in the browser clicking such a button just re-opens the page they're on — no value. The producer surface is the "Copy desktop link" button (see Vault-side component).
- **Folder, tag, search deep-link buttons** on the vault UI. Cheap follow-up but not required to prove the protocol works. The desktop side already supports any vault path; only the producer surface is gated.
- **Auto-detection of "is the desktop installed"** in the browser. No reliable JS API exposes OS-registered scheme handlers. Always show the copy button; users without the app installed paste a URL that no-ops harmlessly.
- **Linux protocol registration.** No Linux installer in the desktop bundle matrix (`tauri.conf.json` `bundle.targets` is `["app", "dmg", "msi"]`).
- **Multi-vault routing.** A desktop install has a single configured `vault_url`. Every `vorevault://` link routes to that one vault. Cross-vault use cases are out of scope.
- **Path-prefix whitelisting** on the desktop side. The desktop is a dumb forwarder; the vault server already 404s unknown routes. Whitelisting just couples desktop releases to vault-route additions.
- **A new settings UI affordance** showing protocol-registration status. Registration is a silent install-time effect; if it fails the user reinstalls.
- **Persistent log of dispatched URLs.** `log::info!` to stderr is sufficient — same logging discipline as the rest of the app.

## Architecture

The feature spans two repos, glued by an OS-level URL scheme.

```
vorevault (web)               OS                          vorevault-desktop
─────────────────              ────                        ──────────────────
file detail page              registers `vorevault://`     deeplink.rs (NEW)
  └─ "Copy desktop link"      handler at install time     ├─ translate(input, vault_url)
        button                                            │      → Result<String, DeepLinkError>
        ↓                                                 ├─ dispatch(app, raw_url)
   clipboard:                                             │      → calls translate, then
   "vorevault://open/                                     │        tauri_plugin_opener::open_url
    files/<uuid>"                                         │
                                                          main.rs (edit)
   user pastes into                                       ├─ tauri-plugin-single-instance plugin
   Discord; another                                       │     callback forwards argv URL
   user clicks ──────► OS routes URL ──────► to running app
                                                          ├─ tauri-plugin-deep-link plugin
                                                          │     on_open_url listener calls
                                                          │     deeplink::dispatch
                                                          ↓
                                                       opener::open_url(target)
                                                          ↓
                                                       user's default browser
                                                          ↓
                                                       https://<vault>/files/<uuid>
```

### Desktop side: file structure

```
src-tauri/src/
├── deeplink.rs        ← NEW. Pure URL translation + dispatch.
│                        translate() has no Tauri imports — unit-testable.
│                        dispatch() is the thin Tauri-aware wrapper.
├── main.rs            ← edit. Add `mod deeplink;`. Add two plugins.
│                              Add deep_link().on_open_url listener in `setup`.
│                              Add #[cfg(debug_assertions)] register_all() in `setup`.
│
└── (no changes to: tray.rs, notifier.rs, pipeline.rs, watcher.rs,
   uploader.rs, settings_window.rs, auth.rs, config.rs, keychain.rs,
   db.rs, folders_api.rs, rules.rs, updater.rs, path.rs)

src-tauri/
├── Cargo.toml         ← edit. Two new dependencies (see below).
└── tauri.conf.json    ← edit. New plugins.deep-link block.

src-tauri/capabilities/  ← may need a new entry — verify during impl
                          (see Capabilities below).
```

### Desktop side: dependencies

```toml
tauri-plugin-deep-link = "2"
tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }
```

The `deep-link` feature on `single-instance` is the integration shim that makes the two plugins cooperate: a second-launched process forwards its argv (containing the URL) to the live process, which then routes through the deep-link listener.

### Desktop side: bundler config

In `tauri.conf.json`:

```json
"plugins": {
  "deep-link": {
    "desktop": { "schemes": ["vorevault"] }
  }
}
```

Tauri's bundler reads this at build time and emits:

- **macOS:** `CFBundleURLTypes` array in the generated `Info.plist` containing one URL type with `CFBundleURLName = fn.bullmoose.vorevault.desktop` and `CFBundleURLSchemes = ["vorevault"]`. macOS routes `vorevault://...` clicks to the bundle via the standard `application:openURLs:` Cocoa hook.
- **Windows:** WiX/MSI table entries that, on install, write `HKCU\Software\Classes\vorevault` keys with `shell\open\command` set to `"<install-path>\VoreVault.exe" "%1"`. Windows passes the URL as `argv[1]` when launching the registered handler. Uninstall removes the keys.

No hand-written installer scripts. No platform-specific `#[cfg]` blocks in our Rust code beyond what the plugin itself uses.

### Desktop side: registration in `main.rs`

```rust
fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Second-launch fired with a URL — forward to running instance.
            for arg in argv.iter().skip(1) {
                if arg.starts_with("vorevault://") {
                    crate::deeplink::dispatch(app, arg);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // ... existing plugins (dialog, notification, autostart, updater) ...
        .invoke_handler(tauri::generate_handler![/* unchanged */])
        .setup(|app| {
            // ... existing setup: tray, settings_window, updater, autostart ...

            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    log::warn!("deep-link: dev-mode register_all failed: {}", e);
                }
            }

            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    crate::deeplink::dispatch(&handle, url.as_str());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

The `single-instance` plugin must be registered **first** (per its docs) so its lock acquires before any other plugin allocates resources that a second process would conflict with.

The `register_all()` call is dev-only because `cargo tauri dev` doesn't run the installer; production installs already register via Info.plist / MSI.

### Desktop side: `deeplink.rs`

```rust
//! `vorevault://` deep-link translation and dispatch.
//!
//! Translation is pure: takes a `vorevault://...` string and the configured
//! vault URL, returns an `https://<vault>/...` string. Dispatch is the thin
//! Tauri-aware wrapper that calls `tauri_plugin_opener::open_url` with the
//! translated target.

use url::Url;

#[derive(Debug)]
pub enum DeepLinkError {
    Parse(url::ParseError),
    BadScheme,
    BadHost,
    HasCredentials,
    HasPort,
    BadPath,
}

impl std::fmt::Display for DeepLinkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DeepLinkError::Parse(e) => write!(f, "parse: {}", e),
            DeepLinkError::BadScheme => write!(f, "scheme must be 'vorevault'"),
            DeepLinkError::BadHost => write!(f, "host must be 'open'"),
            DeepLinkError::HasCredentials => write!(f, "URL must not contain user/password"),
            DeepLinkError::HasPort => write!(f, "URL must not contain a port"),
            DeepLinkError::BadPath => write!(f, "path must begin with '/'"),
        }
    }
}

impl std::error::Error for DeepLinkError {}

impl From<url::ParseError> for DeepLinkError {
    fn from(e: url::ParseError) -> Self { DeepLinkError::Parse(e) }
}

/// Translate a `vorevault://...` URL into an `https://<vault>/...` URL.
/// The output's scheme + host are taken entirely from `vault_url`; only the
/// path, query, and fragment of the input are passed through. There is no
/// input that can produce a non-vault target URL (security by construction).
pub fn translate(input: &str, vault_url: &str) -> Result<String, DeepLinkError> {
    let parsed = Url::parse(input)?;

    if parsed.scheme() != "vorevault" {
        return Err(DeepLinkError::BadScheme);
    }
    if parsed.host_str() != Some("open") {
        return Err(DeepLinkError::BadHost);
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(DeepLinkError::HasCredentials);
    }
    if parsed.port().is_some() {
        return Err(DeepLinkError::HasPort);
    }
    let path = parsed.path();
    if !path.starts_with('/') {
        return Err(DeepLinkError::BadPath);
    }

    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(path);
    if let Some(q) = parsed.query() {
        out.push('?');
        out.push_str(q);
    }
    if let Some(f) = parsed.fragment() {
        out.push('#');
        out.push_str(f);
    }
    Ok(out)
}

/// Translate `raw_url` and hand the result to the system browser. All errors
/// (parse, validation, browser-open failure) are logged but never surfaced to
/// the user — the user clicked a link from elsewhere and a notification or
/// modal here would be confusing.
pub fn dispatch(_app: &tauri::AppHandle, raw_url: &str) {
    let vault = crate::auth::vault_url_from_env();
    match translate(raw_url, &vault) {
        Ok(target) => {
            log::info!("deep link → {}", target);
            if let Err(e) = tauri_plugin_opener::open_url(&target, None::<&str>) {
                log::warn!("deep link: failed to open browser for {}: {}", target, e);
            }
        }
        Err(e) => {
            log::warn!("deep link: rejected input {:?}: {}", raw_url, e);
        }
    }
}
```

`dispatch` takes `&tauri::AppHandle` even though the current implementation doesn't use it; this leaves room to swap to a `WebviewWindow`-based opener later (e.g. focusing the settings window on certain link types) without changing every call site.

### Desktop side: capabilities

`tauri-plugin-deep-link` only exposes events (`on_open_url`), not commands invoked from the webview, so no new capability entries are strictly required for the listener path. However, if the existing `core:default` set in `src-tauri/capabilities/main.json` (or its equivalent) does not already grant `deep-link:default`, add it during implementation. The settings-window-specific capability file does not need any change — the deep-link path never crosses webview boundaries.

### URL grammar

```
vorevault://open<path>[?<query>][#<fragment>]
```

| Component | Required | Notes |
|---|---|---|
| scheme | yes | Must equal `vorevault` (case-insensitive per RFC 3986; `url` crate normalizes). |
| host | yes | Must equal literal `open`. |
| path | yes | Must begin with `/`. Bare `vorevault://open/` (vault root) is allowed. |
| query | no | Passed through verbatim, including encoding. |
| fragment | no | Passed through verbatim. |
| username/password | no | Reject if present. |
| port | no | Reject if present. |

### Translation truth table

| Input | Output | Reason |
|---|---|---|
| `vorevault://open/files/abc` | `https://vault.bullmoosefn.com/files/abc` | normal |
| `vorevault://open/folders/xyz` | `https://vault.bullmoosefn.com/folders/xyz` | normal |
| `vorevault://open/?next=/files/abc` | `https://vault.bullmoosefn.com/?next=/files/abc` | query passthrough |
| `vorevault://open/files/abc#t=10s` | `https://vault.bullmoosefn.com/files/abc#t=10s` | fragment passthrough |
| `vorevault://open/` | `https://vault.bullmoosefn.com/` | bare vault root allowed |
| `vorevault://open//evil.com/x` | `https://vault.bullmoosefn.com//evil.com/x` | network-path reference becomes a path on vault — vault handles |
| `vorevault://open/?redir=//evil.com` | `https://vault.bullmoosefn.com/?redir=//evil.com` | redirect-param safety is vault's responsibility |
| `vorevault://evil.com/files/abc` | `Err(BadHost)` | rejected |
| `vorevault://user:pw@open/x` | `Err(HasCredentials)` | rejected |
| `vorevault://open:8080/x` | `Err(HasPort)` | rejected |
| `vorevault://open` (no path) | `Err(BadPath)` | path doesn't start with `/` |
| `notvorevault://open/files/abc` | `Err(BadScheme)` | rejected (OS would never route this anyway) |
| `vorevault://OPEN/files/abc` | `https://vault.bullmoosefn.com/files/abc` | the `url` crate lowercases hosts during parsing, so by the time we compare against the literal `"open"` the input has been normalized — case-insensitive in practice |
| `not a url` | `Err(Parse(_))` | parse failure |

### Security model

The output URL's scheme, host, and authority come 100% from `vault_url` (loaded from config / env). Only path, query, and fragment of the input are passed through. There is no input that produces a non-vault target URL. Concretely:

- A hostile sender cannot redirect the user to an attacker domain.
- A sender who tries `vorevault://attacker.com/...` is rejected at the `BadHost` branch.
- A sender who embeds an absolute URL in the path (e.g. `vorevault://open/https://evil.com`) produces `https://<vault>/https://evil.com` — a path on the vault, which the vault server 404s.
- A sender who tries `//evil.com/x` produces `https://<vault>//evil.com/x` — also just a path on the vault.
- Redirect-style query parameters (`?next=//evil.com`) pass through; vault is already responsible for sanitizing its own redirect endpoints, this protocol does not change that responsibility.

The desktop does **not** maintain a path-prefix whitelist. That tightening only adds value if the vault routes a path the desktop should refuse to open — there is no such path today, and adding one in the future would require coordination across vault and desktop releases regardless. Trust the vault.

## Single-instance behavior

| Scenario | Behavior |
|---|---|
| App not running, user clicks `vorevault://...` | OS launches `VoreVault.exe` / VoreVault.app. Tauri runtime starts, plugins initialize, `setup` runs, `tray::install` runs (tray icon appears), `deep_link().on_open_url` listener fires with the URL, `dispatch` opens the target in the browser. |
| App already running, user clicks `vorevault://...` | OS spawns a second process. `tauri-plugin-single-instance` callback in the second process detects the lock held by the first, sends the second process's `argv` (containing the URL) to the first process via the plugin's IPC, then exits the second process before any tray icon is registered. The first process's callback runs `dispatch`. |
| Two `vorevault://` URLs delivered in rapid succession | `on_open_url` event carries `Vec<Url>`; the listener iterates and dispatches each. The second-instance callback also iterates `argv` and dispatches each. Browser stacks them in tabs. |
| User invokes the app's executable directly (no URL) | `argv` contains no `vorevault://` entries; the for-loop in the single-instance callback is a no-op. App launches normally. |

The single-instance plugin must be registered **before** any other plugin that allocates singleton state (tray icon, file watchers, etc.); otherwise a second-launched process briefly registers a duplicate before realizing it's the second instance. Standard Tauri pattern.

## Vault-side companion (separate vault-repo PR)

A small change to the file detail page in `Bullmoose-Code/vorevault`. Coupled to the desktop release: ship together so the producer surface lands the same time the consumer ships.

**Where it lives.** File detail page action bar, alongside the existing Download / Share controls.

**What it does.**
1. User clicks a button labeled "Copy desktop link" with a small hand-authored SVG glyph (a desktop / monitor pictograph). No icon-library import — design system bans those (per `design-system/MASTER.md`).
2. Frontend constructs `vorevault://open/files/<file.uuid>` from the file already loaded for the page (no extra fetch).
3. Calls `navigator.clipboard.writeText(url)`.
4. On success: existing toast component shows the standard "Copied" affirmation (use whatever copy the existing share/copy flow uses for consistency — sentence case, terse, no exclamation, per design system).
5. On failure (clipboard permission denied): toast shows the URL inline with a "couldn't copy — copy manually" message so the user can select it. Same toast component, same voice.

**What it does NOT do.**
- No feature detection for "is the desktop installed". Always shown.
- No buttons on folder, tag, or search pages (cheap follow-up if the protocol proves out).
- No server-side route that returns deep-link JSON. Frontend constructs the URL inline.
- No change to OG metadata or Discord embed structure.

**Tests.** One Vitest unit test, colocated with the component (`*.test.tsx` next to the component file per CLAUDE.md), asserting the URL builder produces `vorevault://open/files/<uuid>` for a fixture file. TDD discipline per CLAUDE.md — write the failing test first. Manual smoke-test: click button on a real file, verify clipboard contents and toast.

**Tokens / styling.** Use existing `--vv-*` tokens; no new colors, no soft shadows. The button matches the visual weight of the existing Download / Share controls; the icon is a sticker-shadow button per `design-system/MASTER.md` if those neighbors use that pattern, or a flat icon button otherwise — match the immediate neighbors.

This portion is implemented in the vault repo's normal review flow and does not block the desktop PR's review. The desktop PR should merge first (so producers have something to consume); the vault PR follows immediately.

## Error handling

| Failure | Where caught | User-visible behavior |
|---|---|---|
| Malformed URL (`url::ParseError`) | `translate` → `DeepLinkError::Parse` | None. Logged at `warn`. |
| Wrong scheme / host / has credentials / has port / bad path | `translate` validation | None. Logged at `warn` with the rejected input. |
| `tauri_plugin_opener::open_url` fails (no default browser, plugin error) | `dispatch` | None. Logged at `warn`. Vanishingly rare. |
| `vault_url_from_env` returns empty string | Falls back to `DEFAULT_VAULT_URL` | Same behavior as the rest of the app — vault URL is always defined. |
| `tauri-plugin-single-instance` init failure | `Builder::plugin(...)` returns `Err` | App fails to start (same as any other plugin init failure). |
| `tauri-plugin-deep-link` init failure | Same | Same. |
| Dev-mode `register_all()` failure | Logged at `warn`, app continues | Dev only. Production registers via installer. |
| OS-level registration silently fails on install | Out of band; not detectable from inside the app | User reinstalls or the protocol simply does nothing. |

The discipline is: **never surface a user-visible error for a deep-link failure.** The user is mid-task elsewhere (Discord, email, a webpage) and clicked a link expecting a browser to open. If something goes wrong, the absence of a browser opening is the visible signal; a notification or modal at that moment would be confusing and out of context.

## Logging

`log::info!("deep link → {}", target)` on each successful dispatch. Includes the translated URL (with the file UUID) so a user reporting "I clicked a link and it didn't work" gives us actionable triage data. UUIDs are not PII.

`log::warn!("deep link: rejected input {:?}: {}", raw_url, err)` on every translation rejection. Includes the raw input string for triage.

`log::warn!("deep link: failed to open browser for {}: {}", target, err)` if `open_url` fails.

Same `env_logger` discipline as the rest of the app — stderr only, no separate log file.

## Testing

### Unit (`src-tauri/src/deeplink.rs` `#[cfg(test)] mod tests`)

Pattern matches `auth.rs`, `uploader.rs`. Cover:

- Every accepted shape from the translation truth table.
- Every rejection branch: `BadScheme`, `BadHost`, `HasCredentials`, `HasPort`, `BadPath`, `Parse`.
- Vault-URL variations:
  - `https://vault.bullmoosefn.com` (canonical).
  - `https://vault.bullmoosefn.com/` (trailing slash — gets stripped).
  - `http://localhost:3000` (dev with port).
  - `http://localhost:3000/` (dev with port + trailing slash).
  - `https://vault.example.com/vv` (hypothetical sub-path mount — vault doesn't ship this today but the translator must not break on it).
- Query and fragment passthrough preserves URL-encoding (e.g. `?tag=foo%20bar` stays encoded; not double-encoded).
- Hosts with mixed case (`vorevault://OPEN/...`) — confirmed accepted because the `url` crate lowercases hosts during parsing.

Target: ≥15 test functions. No fixture files needed.

### Integration

Skip. The dispatch path is `translate` (already unit-tested) plus `tauri_plugin_opener::open_url` (third-party plugin). There is no integration harness for OS-level URL routing that doesn't require a UI session.

### Manual matrix (pre-tag checklist for v0.7.0)

- [ ] **Windows clean install:** uninstall any previous VoreVault. Install MSI. From the Start menu Run dialog, type `vorevault://open/files/abc-123`. App launches, tray icon appears, default browser opens to `https://vault.bullmoosefn.com/files/abc-123`.
- [ ] **Windows already-running:** With app already in tray, repeat the Run-dialog test. No second tray icon appears. Browser opens to the file page.
- [ ] **Windows malformed:** Run `vorevault://evil.com/x`. Logs show "deep link: rejected ...". No browser opened.
- [ ] **Windows registry inspection:** After install, `reg query HKCU\Software\Classes\vorevault` shows the `shell\open\command` entry pointing at the install path.
- [ ] **Windows uninstall:** After uninstall, the registry key is gone.
- [ ] **macOS clean install:** Drag VoreVault.app into Applications. Quit any running instance. From Terminal, `open 'vorevault://open/files/abc-123'`. App launches, tray icon appears (in menubar), default browser opens.
- [ ] **macOS already-running:** With app already in menubar, repeat. No second menubar icon. Browser opens.
- [ ] **macOS malformed:** `open 'vorevault://evil.com/x'`. App receives event, logs warn, no browser.
- [ ] **macOS Info.plist inspection:** `plutil -p VoreVault.app/Contents/Info.plist | grep -A3 CFBundleURLTypes` shows the `vorevault` scheme.
- [ ] **macOS uninstall:** After dragging the .app to Trash and emptying, `lsregister -dump | grep vorevault` shows no remaining handler. (May require `lsregister -kill -r -domain local -domain user` to fully clear cached associations — document in RELEASING.md.)
- [ ] **End-to-end with vault PR merged:** From a real file detail page, click "Copy desktop link". Paste into Discord. Click the link from another Discord user's account. Browser opens to the file page on the clicker's machine.
- [ ] **Query + fragment:** click `vorevault://open/files/abc-123#t=30` — browser opens with `#t=30` intact (jumps the video player to the 30s mark, leveraging the existing video player's hash-state behavior).

### Regression scope

- Existing tray and settings-window flows (Theme 1.1 D + 1.2). Click "Open VoreVault…" → settings window appears. Watch folder pick → upload → toast. Sign out → no auth state.
- Verify the new single-instance plugin does not interfere with the existing `tauri-plugin-autostart` first-launch flow (`try_enable_autostart_on_first_launch` in `main.rs`). Both run during `setup`; ordering should not matter, but confirm by toggling autostart off and on after a deep-link launch.

## Versioning + release plan

- Branch: `feat/deeplink-protocol` in `vorevault-desktop`.
- Companion vault-repo branch: `feat/copy-desktop-link` (single small PR; not blocking).
- Bump `Cargo.toml` and `tauri.conf.json` to `0.7.0`.
- Tag `v0.7.0` after merge → existing CI publishes signed Mac DMG + Windows MSI.
- The new `tauri-plugin-deep-link` registry entries / Info.plist URL types take effect on first install/upgrade. Existing v0.6.0 installs that auto-update via `tauri-plugin-updater` will gain the protocol handler on the next update — verify the updater path actually re-runs MSI install actions sufficient to write the registry keys (Tauri's MSI updater currently does a major-upgrade-style install which re-runs the install actions; spot-check during pre-release).

## Out-of-scope ideas worth filing as separate items

- **Toast click → file detail.** Requires swapping notification stack. Will consume `deeplink::dispatch` once it lands.
- **Discord bot integration that auto-posts `vorevault://` links** when an upload completes.
- **Server endpoint** `GET /api/files/:id/deep-link` for programmatic producers.
- **Folder, tag, search "Copy desktop link" buttons.** Trivial follow-up once one button proves the pattern.
- **`vorevault://reveal/<local-path>`** verb that opens Finder/Explorer at a given path on the user's machine. Useful for "show me the source clip" workflows. Out of scope today; the URL grammar leaves room for it because the host is `open` (a sentinel verb), and we can add `reveal` etc. without breaking parsing.
- **`vorevault://settings`** verb that opens the settings window. Useful for "click here to configure" links. Same room in the grammar.
