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

The web repo (`vorevault`) gains the following additive changes (all shipped in **PR #71**, merged 2026-04-25):

- New `GET /api/auth/desktop-init` route
- New `GET /api/auth/me` route
- New `POST /api/auth/desktop-exchange` route
- Extension to existing `GET /api/auth/discord/callback` route (single new conditional branch)
- New `app/src/lib/desktop-state.ts` — state encoding helpers
- New `app/src/lib/auth-codes.ts` — single-use auth code helpers + PKCE S256 transform
- New `db/init/09-auth-codes.sql` migration — `auth_codes` table

Web changes ship first as their own PR (backwards-compatible — does not affect browser flow). Desktop app PR follows once the web change is deployed.

### Tech stack

- **Tauri 2.x** (chosen earlier; Rust shell, ~5–15 MB binary, low idle footprint while gaming)
- **`keyring` crate** for OS keychain — macOS Keychain, Windows Credential Manager. Lighter than `tauri-plugin-stronghold` for "just store a session token."
- **`tiny_http`** for the OAuth loopback listener — synchronous, runs ~30 s once per sign-in
- **`reqwest`** with `rustls-tls` for HTTP client (no OpenSSL on Win)
- **`tauri-plugin-opener`** to launch the system browser
- **`sha2` + `base64` crates** for the PKCE code_challenge transform on the desktop side

## OAuth flow (PKCE-style code exchange via vault-mediated loopback)

> **Updated 2026-04-25** during code review of PR #71: changed from session-token-in-URL to PKCE-style code exchange per RFC 7636. The session credential never enters a URL or browser history — only a short-lived single-use auth code does.

1. User clicks "Sign in" in tray menu
2. Desktop generates a `code_verifier` (32 bytes base64url-encoded → 43 chars), keeps it secret
3. Desktop computes `code_challenge = base64url(SHA256(code_verifier))` (also 43 chars per PKCE S256)
4. Desktop binds `tiny_http` listener on `127.0.0.1:0`; OS assigns free port `PORT`
5. Desktop opens system browser to `https://vault.bullmoosefn.com/api/auth/desktop-init?port=PORT&code_challenge=CHALLENGE`
6. Vault `desktop-init` validates inputs, sets `vv_oauth_state` cookie to `desktop:PORT:CHALLENGE`, redirects browser to Discord OAuth with the same value as `state`
7. User signs in on Discord, approves
8. Discord redirects browser to `https://vault.bullmoosefn.com/api/auth/discord/callback?code=...&state=...`
9. Vault callback runs existing flow (state cookie verification, Discord code exchange, role check, user upsert, session creation), then branches:
   - If `state` matches the desktop format → mints a single-use auth code via `createAuthCode(session.id, code_challenge)` (60-second TTL), redirects browser to `http://127.0.0.1:PORT/?code=<auth_code>`. Still sets `vv_session` cookie so the same browser stays signed in to the web app.
   - Otherwise → existing redirect to `/`
10. Browser hits `localhost:PORT/`. Tauri listener captures `?code=<auth_code>`, serves `success.html`, shuts down
11. Desktop POSTs `{code, code_verifier}` to `https://vault.bullmoosefn.com/api/auth/desktop-exchange`
12. Vault `desktop-exchange`: validates body, calls `exchangeAuthCode(code, code_verifier)` which atomically `UPDATE...WHERE used_at IS NULL AND expires_at > now() AND code_challenge = SHA256($verifier)...RETURNING session_id`. On success, returns `{session_token: <session_id>}`
13. Desktop stores `session_token` in OS keychain
14. Tray menu refreshes to "Signed in as @<username>"

**State encoding:** `desktop:<port>:<code_challenge>` — port + 43-char base64url challenge. Browser flow never produces a state starting with `desktop:`, so the prefix is a clean discriminator.

**Why PKCE rather than the simpler token-in-URL:** the session UUID is a 30-day bearer credential. Putting it in a redirect URL leaks it to browser history (loopback URLs are saved like any other URL). The PKCE flow keeps the session token out of every URL — only the short-lived (60s, single-use) auth code lands in browser history, and the auth code is useless without the verifier (which only the desktop process ever sees).

## Web-side changes (in `vorevault`)

All endpoints shipped in PR #71. Files:

| Path | Status | Responsibility |
|---|---|---|
| `db/init/09-auth-codes.sql` | new | `auth_codes` table: `code` PK, `code_challenge text`, `session_id uuid REFERENCES sessions ON DELETE CASCADE`, `expires_at timestamptz`, `used_at timestamptz`. Plus index on `expires_at`. |
| `app/src/lib/desktop-state.ts` | new | `formatDesktopState`, `parseDesktopState`, `validateDesktopState` |
| `app/src/lib/auth-codes.ts` | new | `createAuthCode(sessionId, codeChallenge)`, `exchangeAuthCode(code, codeVerifier)`, `sha256Base64Url` |
| `app/src/app/api/auth/desktop-init/route.ts` | new | `GET` — validates port + code_challenge, sets state cookie, redirects to Discord |
| `app/src/app/api/auth/discord/callback/route.ts` | modified | desktop branch added before existing browser redirect: mints auth code via `createAuthCode`, redirects to `localhost:PORT/?code=<auth_code>` |
| `app/src/app/api/auth/desktop-exchange/route.ts` | new | `POST` — zod-validated `{code, code_verifier}` body, returns `{session_token}` or 401 |
| `app/src/app/api/auth/me/route.ts` | new | `GET` — returns current user from `vv_session` cookie or 401 |

**Single-use enforcement** in `exchangeAuthCode` is via a single SQL `UPDATE ... SET used_at = now() WHERE code = $1 AND code_challenge = $2 AND used_at IS NULL AND expires_at > now() RETURNING session_id`. Atomic: concurrent redemption attempts serialize at row level; the loser sees zero rows and returns null. Also folds the verifier-binding check into the same query (`code_challenge = $2` where `$2 = sha256Base64Url(code_verifier)`).

**Opportunistic cleanup**: `createAuthCode` runs a probabilistic (~1%) `DELETE` of expired/used rows older than 24 hours, so the table stays bounded without needing cron infrastructure.

**Migration**: deployed manually via psql on LXC 105 per `.ops-private/RUNBOOK.md`. The migration is idempotent (`CREATE TABLE IF NOT EXISTS`).

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
- `sign_in`: generate `code_verifier` (32 bytes base64url, kept secret) + `code_challenge` (SHA256(verifier) base64url). Bind localhost listener, open browser to `desktop-init?port=PORT&code_challenge=CHALLENGE`. Block on `recv()` with 5-min timeout. Validate the request (`GET /` with `?code=<auth_code>`), serve `success.html`. POST `{code, code_verifier}` to `desktop-exchange` over HTTPS. Store the returned `session_token` in keychain. Return username via `current_state` re-call. Holds a process-wide mutex so two sign-in clicks don't race.
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
| `auth::sign_in` URL building (Rust) | Rust unit | Given vault URL + port + code_challenge, builds the expected `desktop-init` URL |
| `auth::sha256_base64url` (Rust) | Rust unit | Matches RFC 7636 §4.2 example vector |
| `parseDesktopState("desktop:42876:<challenge>")` (web side) | Vitest unit | Returns `{port, code_challenge}`; rejects malformed |
| `desktop-init` route | Vitest route test | Validates port range, code_challenge format, sets state cookie, redirects to Discord |
| `desktop-exchange` route | Vitest route test | Validates body, returns 200 `{session_token}` on valid exchange, 401 on bad code/verifier |
| `auth-codes` (web side) | Vitest integration (testcontainers) | Round-trip, wrong verifier, single-use replay (concurrent), expired, unknown code |
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
