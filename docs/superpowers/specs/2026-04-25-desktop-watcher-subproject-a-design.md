# Desktop Watcher — Sub-project A: Scaffold + Auth + Keychain

Implements the foundation of **Theme 1.1** of `docs/superpowers/specs/2026-04-25-roadmap-design.md`. First of three sub-projects (A → B → C) that together ship the **v0.1** desktop tray client. The desktop client lives in a new repo `Bullmoose-Code/vorevault-desktop`; this spec also covers the small additive web-side changes in `Bullmoose-Code/vorevault`.

## Goal

A user can install a Tauri-based tray app on Win or Mac, click "Sign in" to complete a Discord OAuth flow via the system browser, and have a session token stored in the OS keychain. The tray menu reflects signed-in state across launches. **The app does not yet upload anything** — that's Sub-project B.

## Why now

Theme 1.1 is the largest user-visible bet on the roadmap. Sub-project A is the auth foundation everything else depends on; shipping it first lets us validate the OAuth flow end-to-end before building any feature on top. It is itself a complete, testable unit (sign in, persist, sign out) even though it provides no upload functionality yet.

## Architecture

### Repo layout (new)

```
Bullmoose-Code/vorevault-desktop/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs          ← entry point: tray + setup
│       ├── tray.rs          ← tray icon + dynamic menu
│       ├── auth.rs          ← OAuth flow, /api/auth/me check
│       └── keychain.rs      ← `keyring` crate wrapper
├── ui-callback/
│   └── success.html         ← static "you can close this tab" page
├── icons/
│   └── tray.png             ← 22×22 template-ready icon
├── .github/workflows/
│   └── ci.yml               ← cargo test + build on Win + Mac
├── README.md
└── LICENSE
```

No frontend framework. No webview window. The only HTML is `success.html`, served once per sign-in by the temporary localhost listener.

### Cross-repo dependency

The web repo (`vorevault`) gains three small additive changes:
- New `GET /api/auth/desktop-init` route
- Extension to existing `GET /api/auth/discord/callback` route (single new conditional branch)
- New `GET /api/auth/me` route

Web changes ship first as their own PR (backwards-compatible — does not affect browser flow). Desktop app PR follows once the web change is deployed.

### Tech stack

- **Tauri 2.x** (chosen earlier; Rust shell, ~5–15 MB binary, low idle footprint while gaming)
- **`keyring` crate** for OS keychain — macOS Keychain, Windows Credential Manager. Lighter than `tauri-plugin-stronghold` for "just store a session token."
- **`tiny_http`** for the OAuth loopback listener — synchronous, runs ~30 s once per sign-in
- **`reqwest`** with `rustls-tls` for HTTP client (no OpenSSL on Win)
- **`tauri-plugin-opener`** to launch the system browser

## OAuth flow (vault-mediated loopback)

1. User clicks "Sign in" in tray menu
2. Desktop generates 32-byte base64url `csrf`, binds `tiny_http` listener on `127.0.0.1:0`, OS assigns a free port `PORT`
3. Desktop opens system browser to `https://vault.bullmoosefn.com/api/auth/desktop-init?port=PORT&csrf=CSRF`
4. Vault `desktop-init` validates inputs, sets `vv_oauth_state` cookie to `desktop:PORT:CSRF`, redirects browser to Discord OAuth with the same value as `state` and the existing redirect URI
5. User signs in on Discord, approves
6. Discord redirects browser to the existing vault callback (`/api/auth/discord/callback?code=...&state=...`)
7. Vault callback runs the existing flow (state cookie verification, code exchange, role check, user upsert, session creation), then branches:
   - If `state` starts with `desktop:` and the parsed port is in `[1024, 65535]` → `307` redirect to `http://127.0.0.1:PORT/?session=<sessionId>`, set `vv_session` cookie (harmless), clear `vv_oauth_state`
   - Otherwise → existing redirect to `/`
8. Browser hits `localhost:PORT/`, the Tauri listener captures `?session=<id>`, stores it in keychain, serves `success.html`, shuts down
9. Desktop polls keychain back via the worker thread, refreshes tray menu

State encoding: `desktop:<port>:<csrf>`. Browser flow never produces a state with this prefix, so the prefix is a clean discriminator.

## Web-side changes (in `vorevault`)

### `GET /api/auth/desktop-init` (new)

Validates `port` (integer, 1024–65535) and `csrf` (base64url 20–64 chars). Sets `vv_oauth_state` cookie to `desktop:PORT:CSRF` (httpOnly, secure, sameSite=lax, 10-min maxAge). Redirects to Discord OAuth with the same value as `state` and the existing `DISCORD_REDIRECT_URI`. On any validation failure, returns 400 plain text.

### `GET /api/auth/discord/callback` (extended)

After the existing session creation, before the existing `redirect to /`, add a single branch:

```
if (stateInUrl?.startsWith("desktop:")) {
  const parts = stateInUrl.split(":");
  const port = parseInt(parts[1] ?? "", 10);
  if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
    // Redirect to localhost listener with session id in the URL.
    const localUrl = `http://127.0.0.1:${port}/?session=${session.id}`;
    const res = NextResponse.redirect(localUrl, { status: 307 });
    res.cookies.set("vv_session", session.id, /* same opts as existing */);
    res.cookies.set("vv_oauth_state", "", { maxAge: 0 });
    return res;
  }
  // Malformed → fall through to existing browser redirect
}
```

The browser flow is unchanged — adds a conditional branch that only fires when `state` starts with `desktop:`. Existing tests stay green; one new test added for the desktop branch.

### `GET /api/auth/me` (new)

```
const user = await getCurrentUser();
if (!user) return NextResponse.json({ user: null }, { status: 401 });
return NextResponse.json({
  user: { id: user.id, username: user.username, is_admin: user.is_admin },
});
```

Reads the `vv_session` cookie via the existing `getCurrentUser` helper. Used by the desktop on launch to confirm the keychain-stored session is still valid. Also incidentally useful for any future client-side "who am I" lookup.

## Desktop-side modules

### `keychain.rs`

```
const SERVICE: &str = "fn.bullmoose.vorevault.desktop";
const ACCOUNT: &str = "session";

pub fn store(token: &str) -> keyring::Result<()>;
pub fn load()  -> keyring::Result<Option<String>>;
pub fn delete() -> keyring::Result<()>;
```

`load` maps `keyring::Error::NoEntry` to `Ok(None)` so callers can distinguish "not set" from "real error." `delete` is idempotent (NoEntry → Ok).

### `auth.rs`

```
pub struct AuthState { pub username: Option<String> }

pub fn current_state(vault_url: &str) -> AuthState;
pub fn sign_in(vault_url: &str) -> Result<String, AuthError>;  // returns username
pub fn sign_out(vault_url: &str) -> Result<(), AuthError>;
```

- `current_state`: load token from keychain → if none, return `{username: None}`. If some, `GET {vault_url}/api/auth/me` with `Cookie: vv_session=<token>` header. 200 → `{username: Some(...)}`. 401 → delete keychain, return `{username: None}`. Other errors → return last-known state without modifying keychain.
- `sign_in`: bind localhost listener, open browser, block on `recv()` with 5-min timeout, validate the request (`GET /` with `?session=<uuid>`), serve `success.html`, store token, return username via `current_state` re-call. Holds a process-wide mutex so two sign-in clicks don't race.
- `sign_out`: load token, best-effort `POST {vault_url}/api/auth/logout` (ignore errors), delete keychain.

### `tray.rs`

```
pub fn install(app: &tauri::AppHandle) -> tauri::Result<()>;
pub fn refresh_menu(app: &tauri::AppHandle);
```

Builds the system tray with a template-mode icon (macOS dark/light adaptation). Menu structure depends on `current_state`:
- Signed out: `Sign in`, separator, `Quit`
- Signed in: `Signed in as @<username>` (disabled label), separator, `Sign out`, `Quit`

Sign-in/out menu actions spawn worker threads so the UI doesn't block. On completion, the worker calls back to the main thread to `refresh_menu`.

### `main.rs`

Sets up `env_logger`, registers the opener plugin, calls `tray::install` + `tray::refresh_menu` in `setup`, prevents exit on window close (we have no windows; quit is via the tray menu).

## `success.html`

One static file, ~20 lines. Inline-styled (no external CSS), uses VoreVault accent colors. Says "You're signed in. You can close this tab." with an "Open VoreVault" link to `https://vault.bullmoosefn.com`. Bundled into the binary via `include_str!`.

## Configuration

| Variable | Default | Override |
|---|---|---|
| `VAULT_URL` | `https://vault.bullmoosefn.com` | Env var, useful for testing against staging |

That's it. v0.1A has no other configuration.

## Testing

| Layer | Type | Coverage |
|---|---|---|
| `auth::sign_in` URL building | Rust unit | Given vault URL + port + csrf, builds the expected `desktop-init` URL |
| `parseDesktopState("desktop:42876:abc")` (web side) | Vitest unit | Returns `{port, csrf}`; rejects malformed |
| `desktop-init` route | Vitest route test | Validates port range, csrf format, sets state cookie, redirects to Discord |
| Extended `discord/callback` | Vitest route test | Browser flow regression + new desktop-branch test (valid state → localhost redirect; malformed → fallthrough) |
| `me` route | Vitest route test | Returns user when valid; 401 otherwise |
| `keychain` wrapper | Manual smoke per dev machine | Store/load/delete cycle |
| Tray menu refresh | Manual smoke | Sign in → tray updates; sign out → reverts |
| End-to-end OAuth | Manual smoke | Build binary, run, sign in, confirm token in keychain |

End-to-end is genuinely manual for v0.1; CI cannot script "open a browser, sign in to Discord."

## Error handling matrix

| Scenario | Behavior |
|---|---|
| User cancels Discord OAuth | Vault returns 400 in browser tab; localhost 5-min timeout fires; tray shows "Sign in cancelled" briefly, reverts to "Sign in" |
| User lacks Discord role | Vault returns 403; localhost timeout fires; tray shows "Sign in failed: not in the Bullmoose role" |
| Localhost port grab race | `tiny_http::Server::http` returns `Err`; tray shows "Sign in failed: try again" |
| Keychain access denied | OS prompt; if denied, `keyring::set_password` returns `Err`; tray shows "Sign in failed: couldn't save credentials" |
| Network down during `me` on launch | Treat as "unknown"; preserve last-known tray state; retry next launch. Do NOT delete keychain on network errors. |
| Server-side session revoked | `me` returns 401; delete keychain; tray shows "Sign in" |
| User edits keychain to garbage | `me` returns 401; same as above |
| App quit during OAuth flow | Listener dies with process; next browser hit fails. Server session row exists, will be GC'd by 30-day expiry. Acceptable. |
| Two sign-in clicks in quick succession | Second no-ops behind a mutex; tray briefly shows "Sign-in already in progress…" |

## Out of scope (explicit)

| Item | Where it goes |
|---|---|
| Folder picker, file watcher, upload pipeline | Sub-project B |
| Native toast notifications on upload | Sub-project C |
| Settings window UI | Sub-project D |
| Code signing certificates, signed installers, auto-update | Sub-project E |
| Multiple watched folders, per-folder routing | Roadmap item 1.2 |
| `vorevault://` deep-link protocol handler | Roadmap item 1.3 |
| Linux installers in CI | Code stays portable; deferred until someone asks |
| Auto-sign-in on app launch (no click) | Considered, rejected — explicit click matches OS conventions for tray apps |

## Definition of done

A user can:

1. Download the `.dmg` (Mac) or `.msi` (Windows) built locally via `pnpm tauri build` (signed installers come in Sub-project E)
2. Install and launch
3. See `VoreVault — Sign in` in their system tray
4. Click "Sign in" → system browser opens → Discord OAuth → "you can close this tab" page in browser
5. Tray refreshes to `VoreVault — Signed in as @ryan / Sign out / Quit`
6. Quit and relaunch → tray immediately shows `Signed in as @ryan` (keychain persisted)
7. Click "Sign out" → tray reverts to "Sign in"

That's the entire deliverable for Sub-project A. Sub-project B is what makes the app actually useful.
