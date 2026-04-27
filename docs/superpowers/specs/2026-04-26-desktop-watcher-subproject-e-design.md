# Desktop Watcher — Sub-project E: Installers + auto-update

## Goal

Make `vorevault-desktop` actually installable by friends who don't want to clone a repo and run `cargo build`. Specifically:

1. Produce a `.msi` (Windows) and `.dmg` (macOS) artifact for every `v*` git tag, published as a GitHub Release.
2. Wire `tauri-plugin-updater` into the app so installed clients silently fetch and apply new versions on next launch — no manual redownload required.
3. Add a "Check for updates" button + status row to the existing settings window for visibility and manual control.

This sub-project is the bootstrapping release: friends manually install v0.5.0 once, and from then on auto-update carries them forward.

## Why now

Sub-projects A–D produced a working tray app, but every friend who wants to use it currently has to install Rust, clone the (formerly private) repo, and run `cargo tauri build`. That's a non-starter for the actual target audience (Ryan's gaming friend group). E removes that barrier without spending money on code-signing certificates and without making future releases more painful than tagging.

## Non-goals (deferred)

- **OS code signing.** Apple Developer ($99/yr) and Windows OV/EV certs ($200-500/yr) are deliberately skipped. Friends will see Gatekeeper / SmartScreen warnings on initial install only — auto-update means they fight those warnings exactly once. Revisit when there's evidence the friction matters.
- **Linux installers.** No `.deb` / `.AppImage`. Friend group is Windows-heavy with some Mac, basically zero Linux desktop. Trivial to add later (one matrix entry, one bundle target).
- **Update prompts during a session.** No "Update available — restart now?" toasts. Updates download silently; install happens on next quit/launch. Manual "Check now" button is the only way to interact with the updater mid-session.
- **A version-bump script.** Three files (`Cargo.toml`, `tauri.conf.json`, regenerated `Cargo.lock`) is bearable manually. A script can come later if it gets annoying.
- **Migration to a new updater keypair.** If the private key is lost, every installed client must manually reinstall to pick up a new public key. There is no in-band migration path. This is documented but not engineered around.
- **CI-side smoke install of artifacts.** No headless install verification. Manual end-to-end testing only (runbook in §Testing).
- **Release notes automation.** Tag annotations are written by hand; no `git-cliff` / Conventional Commits parser. Tag message is what shows up in the GitHub Release body.

## Prerequisites (already satisfied)

- `Bullmoose-Code/vorevault-desktop` is now public (flipped 2026-04-26 during E's brainstorm). Updater can fetch release assets anonymously.
- A scan of tracked files + full git history confirmed no committed secrets before the visibility flip.

## Architecture

```
                    ┌─────────────────────────┐
                    │  Developer machine      │
                    │  - bumps version (3 files)
                    │  - git commit + tag v*
                    │  - git push --tags
                    └──────────┬──────────────┘
                               │ tag push triggers
                               ▼
   ┌──────────────────────────────────────────────────────────┐
   │  GitHub Actions: .github/workflows/release.yml            │
   │                                                           │
   │  matrix: [windows-latest, macos-latest]                   │
   │     └─ tauri-apps/tauri-action@v0                         │
   │          - cargo build --release                          │
   │          - bundle .msi / .dmg                             │
   │          - sign latest.json with TAURI_SIGNING_PRIVATE_KEY│
   │          - upload artifacts to draft Release              │
   │                                                           │
   │  publish-job (needs: build):                              │
   │     └─ promote draft → published Release                  │
   └─────────────────────────┬────────────────────────────────┘
                             │ assets now public
                             ▼
   ┌──────────────────────────────────────────────────────────┐
   │  GitHub Release v0.5.X                                    │
   │  - VoreVault_0.5.X_x64_en-US.msi                          │
   │  - VoreVault_0.5.X_aarch64.dmg                            │
   │  - VoreVault_0.5.X_x64.dmg                                │
   │  - latest.json  (signed updater manifest)                 │
   └──────────────────────────┬───────────────────────────────┘
                              │ stable URL
                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Installed client (any prior v0.5.X+)                     │
   │  - 5s after startup, spawns updater check task            │
   │  - GETs https://github.com/.../releases/latest/download/  │
   │         latest.json   (excludes prereleases)              │
   │  - verifies signature against embedded pubkey             │
   │  - if newer: downloads installer in background            │
   │  - on next quit/launch: silent install, app relaunches    │
   └──────────────────────────────────────────────────────────┘
```

The whole pipeline is push-button: tag → wait ~10-15 min → release is live → installed clients update on their next quit/launch.

## Components

### 1. `release.yml` workflow

New file at `.github/workflows/release.yml`. Runs in addition to the existing `ci.yml` (which keeps gating PRs). Independent triggers:

- `release.yml` fires on `push: tags: ['v*']`
- `ci.yml` keeps firing on `push: branches: [main]` and `pull_request: branches: [main]`

Concurrency group `release-${{ github.ref }}` prevents two concurrent runs of the same tag (defensive — shouldn't normally happen).

**Build job** (matrix):
```yaml
strategy:
  matrix:
    platform: [windows-latest, macos-latest]
runs-on: ${{ matrix.platform }}
steps:
  - uses: actions/checkout@v4
  - uses: dtolnay/rust-toolchain@stable
  - uses: Swatinem/rust-cache@v2
    with: { workspaces: src-tauri }
  - uses: tauri-apps/tauri-action@v0
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
    with:
      tagName: ${{ github.ref_name }}
      releaseName: 'VoreVault Desktop ${{ github.ref_name }}'
      releaseBody: ''  # falls back to tag annotation
      releaseDraft: true
      prerelease: ${{ contains(github.ref_name, '-') }}
      projectPath: src-tauri
      args: ${{ matrix.platform == 'macos-latest' && '--target universal-apple-darwin' || '' }}
```

Notes:
- `prerelease` is set to true when the tag contains `-` (e.g., `v0.5.0-rc.1`). Updater serves only the GitHub "latest release" which excludes prereleases, so RCs never get pushed to real users.
- `tauri-action` handles the entire build → bundle → sign → upload sequence. We don't shell out to individual cargo commands.
- macOS gets `--target universal-apple-darwin` to produce a single `.dmg` that runs on both Intel and Apple Silicon. Removes a matrix dimension and halves the artifact count.
- No fmt/clippy/test re-runs in `release.yml`; `ci.yml` already gated the merge commit.

**Publish job** (`needs: [build]`):
```yaml
runs-on: ubuntu-latest
steps:
  - uses: actions/checkout@v4
  - run: gh release edit ${{ github.ref_name }} --draft=false
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Promotes the draft to published once both matrix entries succeed. Skipped for prereleases (they stay as drafts marked prerelease until manually published, OR — simpler — also auto-promoted since prerelease flag already excludes them from updater traffic). **Decision: auto-promote both.** Less manual fiddling; the prerelease flag does the safety work.

### 2. Updater plugin in the app

New dependency in `src-tauri/Cargo.toml`:
```toml
tauri-plugin-updater = "2"
```

Plugin registered in `main.rs` builder chain alongside the others:
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

Configuration in `src-tauri/tauri.conf.json`:
```json
"plugins": {
  "updater": {
    "active": true,
    "pubkey": "<base64 pubkey, generated locally and pasted in>",
    "endpoints": [
      "https://github.com/Bullmoose-Code/vorevault-desktop/releases/latest/download/latest.json"
    ]
  }
}
```

The endpoint URL is a stable GitHub redirect — it always serves whatever asset named `latest.json` is on the most recent published Release (excluding prereleases).

### 3. New module `src-tauri/src/updater.rs`

State machine + emit helpers + Tauri commands for the settings window to talk to.

```rust
pub enum UpdaterState {
    Idle,                      // initial; or after successful UpToDate check
    Checking,                  // request in flight
    UpToDate,                  // server returned no-newer; same as Idle for UI
    DownloadingUpdate(String), // version being downloaded
    Ready(String),             // staged; "restart to apply"
    Error(String),             // last check / download failed
}
```

Three Tauri commands registered:
- `updater_check_now() -> ()` — manual trigger; sets Checking, calls `app.updater().check()`, transitions state, emits.
- `updater_install_and_restart() -> ()` — invoked when user clicks "Restart now" from a Ready state.
- `updater_get_state() -> UpdaterState` — initial read for settings window on open.

Startup hook in `main.rs` setup spawns `tokio::spawn(check_for_updates_task(app_handle))` which:
1. Sleeps 5 seconds (lets the app finish initializing)
2. Calls the same logic as `updater_check_now`
3. On `UpdateAvailable`: transitions to `DownloadingUpdate`, calls `update.download_and_install(...)`, transitions to `Ready` on success, emits `updater:ready`
4. Logs all errors via `eprintln!`; never panics, never blocks

State changes emit `updater:state-changed` events with the full state payload. Settings window listens and re-renders its update row.

### 4. Settings window — new "Updates" row

Below the existing "Version" row in `ui/settings.html`:

```html
<div class="row" id="updates-row">
  <div class="row-label">Updates</div>
  <div class="row-value">
    <span id="updates-status">Up to date</span>
    <button id="updates-check-btn" class="brand-btn-secondary">Check now</button>
    <button id="updates-restart-btn" class="brand-btn-primary" hidden>Restart now</button>
  </div>
</div>
```

`ui/settings.js` renderer logic, by state:

| State | Status text | Check btn | Restart btn |
|---|---|---|---|
| Idle / UpToDate | "Up to date · v0.5.X" | enabled | hidden |
| Checking | "Checking…" | disabled (spinner) | hidden |
| DownloadingUpdate(v) | "Downloading v… in background" | disabled | hidden |
| Ready(v) | "Update v ready — restart to apply" | hidden | shown |
| Error(msg) | "Couldn't check (msg) · retry" | enabled | hidden |

Click handlers wire to `tCore.invoke('updater_check_now')` and `tCore.invoke('updater_install_and_restart')`. Initial render reads current state via `updater_get_state`.

### 5. Capability update

`src-tauri/capabilities/settings.json` adds:
- `updater:default` plugin permission (lets the plugin do its work)
- `allow-updater-check-now`, `allow-updater-install-and-restart`, `allow-updater-get-state` app commands

### 6. Updater keypair (one-time, manual)

Generated locally, NEVER in CI:
```bash
cargo install tauri-cli --locked
cargo tauri signer generate -w ~/.tauri/vorevault-updater.key
```

Storage:

| What | Where |
|---|---|
| Private key file | 1Password (or equivalent), plus an offline backup |
| Private key passphrase | 1Password |
| GH secret `TAURI_SIGNING_PRIVATE_KEY` | `gh secret set` from the local file |
| GH secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `gh secret set` |
| Public key | committed plain in `tauri.conf.json` |

⚠️ **The private key is irreplaceable.** Losing it means no auto-update can ever reach existing v0.5.X+ installs again — they'd have to manually reinstall to pick up a new public key. Treat with same gravity as a Linux distro's signing key.

### 7. RELEASING.md

New file at repo root. Step-by-step copy-pasteable runbook:

1. Bump version in 3 files (`tauri.conf.json`, `Cargo.toml`, regenerate `Cargo.lock` via cargo build)
2. Stage all 3 + commit `chore: bump to vX.Y.Z`
3. Annotated tag `git tag -a vX.Y.Z -m "..."`
4. `git push origin main && git push origin vX.Y.Z`
5. Wait 10-15 min for `release.yml` to publish
6. Smoke test: download the new artifact, verify version, click "Check now" from a prior install → should silently update on quit/launch
7. Post link to Discord

Includes a "if things go wrong" section (delete the release + tag + repush) and a note that signature verification failures are NOT in any automated test.

## Data flow: a version 0.5.0 → 0.5.1 update

1. Friend has v0.5.0 installed and running. App startup task ran the updater check 5s after launch, got `UpToDate`, state is `Idle`.
2. Developer pushes `v0.5.1` tag. `release.yml` runs ~12 min, publishes the new Release with `latest.json`.
3. Friend never sees anything. App is still running, still uploading clips, still pausing on demand. No popup.
4. Friend quits the app at end of gaming session.
5. Next morning, friend launches the app. Tray icon appears. After 5s, startup task runs the updater check. `latest.json` says version `0.5.1`, signature verifies against embedded pubkey. State transitions: `Idle → Checking → DownloadingUpdate("0.5.1")`. Installer downloads to a Tauri-managed staging area in the background.
6. Download succeeds. State transitions to `Ready("0.5.1")`. Event `updater:ready` emits. (No toast notification — settings window is closed; tray menu doesn't surface this.)
7. Friend opens settings (perhaps incidentally). Sees "Update 0.5.1 ready — restart to apply" + a "Restart now" button. Or doesn't open settings; either way, on next quit + relaunch, the staged installer applies automatically.
8. Friend clicks "Restart now" (or just quits). Tauri's plugin invokes the platform installer (Windows: silent MSI; macOS: in-place .app replacement). App relaunches as v0.5.1.

## First-launch flow (already-installed v0.4.0 → v0.5.0)

This is the **discontinuity** in the auto-update story. Anyone on v0.4.0 cannot auto-update to v0.5.0 because v0.4.0 doesn't have the updater plugin. They must manually:

1. Click a Discord link to the v0.5.0 GitHub Release
2. Download the .msi or .dmg
3. Click through SmartScreen / Gatekeeper warnings
4. Run the installer (which installs over the existing app or replaces it)
5. Re-sign in (the keychain entry persists across reinstalls but verify in testing)
6. Re-pick the watch folder (the SQLite index in app data should persist; verify)

After that one manual install, they're on auto-update permanently.

## Error handling

| Failure | Behavior |
|---|---|
| Network down at startup check | log "updater: network unreachable", state → `Error`, settings shows "Couldn't check · retry" |
| `latest.json` 404 / parse error | log details, state → `Error`, surface generic "Couldn't check" |
| Signature mismatch on `latest.json` | log loudly with version + URL, state → `Error("update rejected — signature mismatch")`, surface as "Update rejected (security failure) — contact dev" |
| Download fails mid-stream | plugin's built-in transient-error retry kicks in; on full failure state → `Error`, surface "Download failed · retry" |
| Install fails (disk full, perms) | state → `Error`, surface "Install failed · check disk space" |
| App is mid-upload when update is ready | irrelevant; install only happens on quit, never interrupts an in-flight upload |

**Updater errors NEVER:**
- Block app startup
- Crash the app
- Interfere with the upload pipeline
- Pop a toast notification
- Show a modal dialog

The updater is best-effort. If it can't update today, it tries again on the next launch.

## Testing

### Automated (in this sub-project)

- `src-tauri/src/updater.rs` state machine: unit tests for transitions (~5 small tests, pure logic, no Tauri runtime).
- That's it. The release pipeline and end-to-end update flow cannot be meaningfully unit-tested.

### Manual end-to-end runbook (run before first real `v0.5.0` tag)

1. **RC tag with prerelease flag.** Bump to `0.5.0-rc.1`, commit, tag, push. Verify in GitHub Releases UI that "Pre-release" badge is set (because tag contains `-`).
2. **Verify artifacts exist.** `.msi`, `.dmg` (universal), `latest.json`. Open `latest.json` and confirm `signature` field is non-empty.
3. **Install on real Windows.** Click through SmartScreen ("More info → Run anyway"). App launches, tray icon appears, settings window shows "Up to date · 0.5.0-rc.1".
4. **Install on real macOS.** Right-click → Open ("unidentified developer"). Same checks.
5. **Push a second build.** Bump to `0.5.0-rc.2`, tag, push. Verify it's also a prerelease.
6. **Verify auto-update path is INACTIVE for prereleases.** On both installed boxes, click "Check now" — should still show "Up to date · 0.5.0-rc.1" because the GitHub `/releases/latest` endpoint excludes prereleases. (This is critical — confirms RCs can't accidentally hit real users.)
7. **Make a non-prerelease "latest" exist.** Either flip `v0.5.0-rc.2`'s prerelease flag off in the GitHub Releases UI (`gh release edit v0.5.0-rc.2 --prerelease=false`), OR — preferred for cleanliness — bump to `0.5.0`, tag `v0.5.0` directly (no `-` suffix → workflow skips the prerelease flag → `/releases/latest` now resolves to it).
8. **Verify auto-update.** On both boxes, quit + relaunch. After 5s, settings should show "Downloading 0.5.0…" then "Update 0.5.0 ready — restart to apply". Click "Restart now". App quits, installer runs, app relaunches as `v0.5.0`.
9. **Verify manual "Check now"** by clicking it from a known up-to-date state — brief "Checking…" then back to idle.
10. **Verify error path** by disabling network, clicking "Check now" → "Couldn't check · retry". Reconnect, retry → idle.

If all 10 steps pass, the release infrastructure is real. v0.5.0 is the tag that ships it.

### Untested by design

- Signature mismatch behavior (would require crafting a fake update with a wrong key — not worth the effort for friend-group scope; failure mode is "refuse + log loudly" with minimal blast radius).
- Disk-full / perms install failures (rely on Tauri plugin error reporting + the generic `Error` state surfacing).

Both noted in `RELEASING.md` as known untested paths.

## What ships in v0.5.0

- `.github/workflows/release.yml` (new)
- `tauri-plugin-updater` dep + initialization
- `src-tauri/src/updater.rs` (new module: state machine + commands + startup task)
- `src-tauri/tauri.conf.json` plugins.updater config (with real pubkey)
- `src-tauri/capabilities/settings.json` updates (plugin perm + 3 app command perms)
- `ui/settings.html` + `settings.css` + `settings.js` — new "Updates" row
- `RELEASING.md` at repo root
- Version bump to `0.5.0` (3 files)
- Updater keypair generated, secrets set in GH

## What does NOT ship in v0.5.0

- OS code signing (Apple/Windows certs)
- Linux installers
- A version-bump script
- Update prompts during a session
- Toast notification when an update is ready
- CI smoke install of artifacts
- Release notes automation
- Any non-release feature work (per-folder routing, deep links — those start at v0.6.0)

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lose the updater private key | Low (1Password + offline backup) | Document recovery (manual reinstall path); accept the cost |
| `tauri-action` breaks on a Tauri version upgrade | Medium over time | Pin to `@v0` major, monitor releases; release.yml is small and easy to fix |
| First v0.5.0 release publishes broken artifacts | Medium (this is brand-new) | RC tag dance in §Testing catches this; v0.5.0 only goes out after RC validates |
| Friend on a flaky network gets stuck mid-download | Low | Plugin retries 3x; on full failure, state goes Error and next launch retries from scratch |
| Friend uninstalls and reinstalls, loses watch folder config | Low | Tauri app data persists across reinstalls on both platforms; verify in §Testing step 4 |
| Repo went public exposes something | Already mitigated | Pre-flip scan was clean (current files + full git history); no tokens/keys/internal IPs |
